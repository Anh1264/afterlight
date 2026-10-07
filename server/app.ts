// AFTERLIGHT game server factory: rooms, matchmaking by link, authoritative rules, bot opponent.
// Every inbound event is parsed (shared/protocol.ts) before use; every timer runs under guard().
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import { ALL_HOUSES, House, validateDeck } from '../shared/cards';
import { GEvent, GameState, PIdx, PlayerView, applyAction, createGame, forfeit, viewFor } from '../shared/engine';
import { decide } from '../shared/bot';
import {
  BAD_REQUEST, GENERIC_ERROR, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
  parseAction, parseCreate, parseDeck, parseHouse, parseJoin, parseReady,
} from '../shared/protocol';
import type { ClientToServer, RoomSnapshot, ServerEndReason, ServerToClient } from '../shared/protocol';
import { DEFAULT_LIMITS, type ServerLimits } from './limits';
import { consoleSink, logError, type LogSink } from './log';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIST = path.resolve(__dirname, '../dist');
const LOBBY_KEEP_MS = 10 * 60_000; // 2b replaces this with the sweep's emptySince rule
const ENDED_TOAST = 'This match was ended by the server. Go Home to start a new one.';
const OTHER_TAB_TOAST = 'This match is now open in another tab.';

export type TimerKind = 'bot' | 'turn' | 'drop' | 'idle' | 'sweep';
export interface ServerHooks {
  /** first line of every guarded timer */
  onTimer?(kind: TimerKind, code: string | null): void;
  /** first line of every wrapped handler */
  onHandler?(event: string): void;
  /** before every viewFor() the server sends */
  onView?(seat: PIdx): void;
}
export interface ServerOptions {
  /** null: API only (tests) */
  distDir?: string | null;
  limits?: Partial<ServerLimits>;
  log?: LogSink;
  botDelayMs?: (events: GEvent[]) => number;
  hooks?: ServerHooks;
}
export interface HealthJson { ok: true; rooms: number; uptimeS: number }
export interface GameServer { listen(port: number): Promise<number>; close(): Promise<void>; health(): HealthJson }

interface Seat {
  token: string;
  name: string;
  house: House | null;
  ready: boolean;
  deck: string[] | null;
  socketId: string | null;
  isBot: boolean;
  dropTimer?: NodeJS.Timeout;
  /** the last view sent to this seat, so a server-ended match can still show the last good board */
  lastView?: PlayerView;
}

interface Room {
  code: string;
  /** random log id; never the room code */
  rid: string;
  vsBot: boolean;
  seats: [Seat | null, Seat | null];
  phase: 'lobby' | 'playing' | 'over';
  game: GameState | null;
  seq: number;
  deadline: number | null;
  turnTimer?: NodeJS.Timeout;
  botTimer?: NodeJS.Timeout;
  idleTimer?: NodeJS.Timeout;
  rematch: [boolean, boolean];
  touched: number;
}

/** Inbound events are untyped until parsed. */
type ListenEvents = { [K in keyof ClientToServer]: (...args: unknown[]) => void };
type Reply = (res: unknown) => void;

const newToken = () => randomBytes(16).toString('hex');
const newRid = () => randomBytes(4).toString('hex');
const clean = (s: string, fallback: string) => s.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 18) || fallback;

/** Rough time the client needs to animate a batch of events before the next move should land. */
function animTime(events: GEvent[]) {
  let t = 500;
  for (const e of events) {
    if (e.t === 'play') t += 900;
    else if (e.t === 'resolve') t += 700;
    else if (e.t === 'roundEnd') t += 2600;
    else if (e.t === 'duel') t += 500;
    else if (e.t === 'dmg' || e.t === 'boost' || e.t === 'status' || e.t === 'summon' || e.t === 'steal' || e.t === 'move') t += 220;
  }
  return Math.min(t, 6000);
}

export function createGameServer(opts: ServerOptions = {}): GameServer {
  const limits: ServerLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const log = opts.log ?? consoleSink;
  const hooks = opts.hooks ?? {};
  const botDelayMs = opts.botDelayMs ?? ((events: GEvent[]) => animTime(events) + 500 + Math.random() * 700);
  const distDir = opts.distDir === undefined ? DEFAULT_DIST : opts.distDir;
  const bootedAt = Date.now();

  const rooms = new Map<string, Room>();
  const newCode = () => {
    for (;;) {
      const c = Array.from(randomBytes(ROOM_CODE_LENGTH), b => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
      if (!rooms.has(c)) return c;
    }
  };

  const app = express();
  const health = (): HealthJson => ({ ok: true, rooms: rooms.size, uptimeS: Math.round((Date.now() - bootedAt) / 1000) });
  app.get('/health', (_req, res) => { res.json(health()); });
  if (distDir && fs.existsSync(distDir)) {
    const dist = distDir;
    app.use(express.static(dist, { maxAge: '1h', index: false, setHeaders: (res, file) => { if (file.endsWith('manifest.json')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.use('/art', (_req, res) => { res.status(404).end(); });
    app.use((_req, res) => { res.sendFile('index.html', { root: dist }); });
  }
  const http = createServer(app);
  const io = new Server<ListenEvents, ServerToClient>(http, { cors: { origin: true }, maxHttpBufferSize: 1_000_000 });

  // ----------------------------------------------------------- rooms and timers
  function clearTimers(r: Room) {
    clearTimeout(r.turnTimer); clearTimeout(r.botTimer); clearTimeout(r.idleTimer);
  }
  function deleteRoom(r: Room) {
    clearTimers(r);
    r.seats.forEach(s => { if (s) clearTimeout(s.dropTimer); });
    if (rooms.get(r.code) === r) rooms.delete(r.code);
  }
  /** Every timer callback goes through here: hook, try, and on a throw end that match (never the process). */
  function guard(kind: TimerKind, r: Room | null, fn: () => void): () => void {
    return () => {
      try {
        hooks.onTimer?.(kind, r?.code ?? null);
        fn();
      } catch (e) {
        logError(log, 'timer:' + kind, e, r?.rid ?? null);
        if (r) failRoom(r);
      }
    };
  }
  function failRoom(r: Room) {
    try {
      if (r.phase === 'playing') endByServer(r, 'error');
      else deleteRoom(r);
    } catch (e) {
      logError(log, 'failRoom', e, r.rid);
      clearTimers(r);
      r.seats.forEach(s => {
        if (!s) return;
        clearTimeout(s.dropTimer);
        if (s.socketId) io.to(s.socketId).emit('toast', ENDED_TOAST);
      });
      rooms.delete(r.code);
    }
  }

  // ----------------------------------------------------------- broadcasting
  function snapshot(r: Room, you: PIdx): RoomSnapshot {
    return {
      code: r.code, phase: r.phase, vsBot: r.vsBot, you, rematch: r.rematch,
      seats: r.seats.map(s => s && {
        name: s.name, house: s.house, ready: s.ready, connected: s.isBot || !!s.socketId, isBot: s.isBot, customDeck: !!s.deck,
      }) as RoomSnapshot['seats'],
    };
  }
  function sendRoom(r: Room) {
    r.seats.forEach((s, i) => { if (s?.socketId) io.to(s.socketId).emit('room', snapshot(r, i as PIdx)); });
  }
  function sendGame(r: Room, events: GEvent[]) {
    const g = r.game;
    if (!g) return;
    r.seq++;
    r.seats.forEach((s, i) => {
      if (!s?.socketId) return;
      hooks.onView?.(i as PIdx);
      const view = viewFor(g, i as PIdx);
      s.lastView = view;
      io.to(s.socketId).emit('game', { seq: r.seq, view, events, deadline: r.deadline });
    });
  }

  /** End a playing match because the server failed or the human went idle. Never a forfeit: no VICTORY or DEFEAT. */
  function endByServer(r: Room, reason: ServerEndReason) {
    const g = r.game;
    clearTimers(r);
    r.seq++;
    r.deadline = null;
    r.seats.forEach((s, i) => {
      if (!s?.socketId) return;
      io.to(s.socketId).emit('toast', ENDED_TOAST);
      let view = s.lastView;
      try {
        hooks.onView?.(i as PIdx);
        if (g) view = viewFor(g, i as PIdx);
      } catch (e) {
        logError(log, 'endByServer:view', e, r.rid);
        view = s.lastView;
      }
      if (view) io.to(s.socketId).emit('game', { seq: r.seq, view, events: [], deadline: null, ended: reason });
    });
    deleteRoom(r);
  }

  // ----------------------------------------------------------- game flow
  function armIdle(r: Room) {
    clearTimeout(r.idleTimer);
    if (!r.vsBot || r.phase !== 'playing') return;
    r.idleTimer = setTimeout(guard('idle', r, () => endByServer(r, 'idle')), limits.botIdleMs);
  }

  function startGame(r: Room) {
    const [a, b] = r.seats;
    if (!a || !b || !a.house || !b.house) return;
    const { state, events } = createGame({
      houses: [a.house, b.house], names: [a.name, b.name],
      decks: r.vsBot ? [null, null] : [a.deck, b.deck], // vs bot: starter decks only (DM-8)
    });
    r.game = state; r.phase = 'playing'; r.seq = 0; r.rematch = [false, false];
    sendRoom(r);
    scheduleTurn(r, events);
    armIdle(r);
    sendGame(r, events);
  }

  function scheduleTurn(r: Room, events: GEvent[]) {
    clearTimeout(r.turnTimer); clearTimeout(r.botTimer);
    const g = r.game;
    r.deadline = null;
    if (!g) return;
    if (g.over) { r.phase = 'over'; clearTimeout(r.idleTimer); sendRoom(r); return; }
    const seat = r.seats[g.current];
    if (!seat) return;
    if (seat.isBot) {
      r.botTimer = setTimeout(guard('bot', r, () => {
        const cur = r.game;
        if (!cur || cur.over) return;
        const p = cur.current;
        act(r, p, decide(cur, p));
      }), botDelayMs(events));
    } else if (!r.vsBot) { // no turn clock against the bot (DM-2)
      r.deadline = Date.now() + animTime(events) + limits.turnMs;
      r.turnTimer = setTimeout(guard('turn', r, () => {
        const cur = r.game;
        if (!cur || cur.over) return;
        if (seat.socketId) io.to(seat.socketId).emit('toast', 'Time ran out — you passed.');
        act(r, cur.current, { type: 'pass' });
      }), Math.max(0, r.deadline - Date.now()));
    }
  }

  function act(r: Room, p: PIdx, a: Parameters<typeof applyAction>[2]): string | null {
    if (!r.game) return 'No game running.';
    const res = applyAction(r.game, p, a);
    if ('error' in res) return res.error;
    r.touched = Date.now();
    if (!r.seats[p]?.isBot) armIdle(r);
    scheduleTurn(r, res.events);
    sendGame(r, res.events);
    return null;
  }

  function endByForfeit(r: Room, loser: PIdx) {
    if (!r.game || r.game.over) return;
    const ev = forfeit(r.game, loser);
    clearTimers(r);
    r.deadline = null; r.phase = 'over';
    sendGame(r, ev);
    sendRoom(r);
  }

  // ----------------------------------------------------------- sockets
  io.on('connection', (socket: Socket<ListenEvents, ServerToClient>) => {
    let room: Room | null = null;
    let seatIdx: PIdx | null = null;

    /** This socket still holds its seat in a live room. */
    const owned = () => room !== null && seatIdx !== null && rooms.get(room.code) === room && room.seats[seatIdx]?.socketId === socket.id;

    const attach = (r: Room, i: PIdx) => {
      const s = r.seats[i];
      if (!s) return;
      room = r; seatIdx = i;
      const prev = s.socketId;
      s.socketId = socket.id;
      clearTimeout(s.dropTimer);
      if (prev && prev !== socket.id) { // the newest tab takes the seat (c6)
        io.to(prev).emit('toast', OTHER_TAB_TOAST);
        io.sockets.sockets.get(prev)?.leave(r.code);
      }
      socket.join(r.code);
      sendRoom(r);
      if (r.game) {
        hooks.onView?.(i);
        const view = viewFor(r.game, i);
        s.lastView = view;
        socket.emit('game', { seq: r.seq, view, events: [], deadline: r.deadline });
      }
    };

    /** Leave whatever seat this socket holds: only room:create, room:join and room:leave call this. */
    const release = () => {
      const r = room;
      if (r && owned()) {
        drop(true);
        if (r.vsBot) deleteRoom(r);
      }
      room = null; seatIdx = null;
    };

    /** Wrap one inbound event: pick off the ack, run the hook, catch everything. */
    const on = (event: keyof ClientToServer | 'disconnect', fn: (payload: unknown, reply: Reply) => void) => {
      socket.on(event, (...args: unknown[]) => {
        const last = args[args.length - 1];
        const ack = typeof last === 'function' ? last : null;
        if (ack) args.pop();
        let replied = false;
        const reply: Reply = res => {
          if (!ack || replied) return;
          replied = true;
          try { ack(res); } catch (e) { logError(log, 'ack:' + event, e, room?.rid ?? null); }
        };
        try {
          hooks.onHandler?.(event);
          fn(args[0], reply);
        } catch (e) {
          logError(log, 'handler:' + event, e, room?.rid ?? null);
          reply({ error: GENERIC_ERROR });
          if (room && owned() && room.phase === 'playing') failRoom(room);
        }
      });
    };
    const LINK_GONE = 'That match link has expired or never existed.';
    const reject = (reply: Reply) => reply({ error: BAD_REQUEST });

    /** The acting socket's room and seat, or an error reply. */
    const mine = (reply: Reply, phase?: Room['phase']): { r: Room; i: PIdx; s: Seat } | null => {
      const r = room, i = seatIdx;
      const s = r && i !== null ? r.seats[i] : null;
      if (!r || i === null || !s || !owned()) {
        const live = r !== null && rooms.get(r.code) === r;
        reply({ error: live && s?.socketId ? 'This match is open in another tab.' : 'Not in a match.' });
        return null;
      }
      if (phase && r.phase !== phase) {
        reply({ error: phase === 'lobby' ? 'Not in a lobby.' : 'Not in a match.' });
        return null;
      }
      return { r, i, s };
    };

    on('room:create', (p, reply) => {
      const q = parseCreate(p);
      if (!q.ok) return reject(reply);
      release();
      const r: Room = {
        code: newCode(), rid: newRid(), vsBot: q.v.vsBot, seats: [null, null], phase: 'lobby', game: null, seq: 0,
        deadline: null, rematch: [false, false], touched: Date.now(),
      };
      const token = newToken();
      r.seats[0] = { token, name: clean(q.v.name, 'Player 1'), house: null, ready: false, deck: null, socketId: null, isBot: false };
      if (r.vsBot) r.seats[1] = { token: newToken(), name: 'Afterlight Bot', house: null, ready: true, deck: null, socketId: null, isBot: true };
      rooms.set(r.code, r);
      reply({ code: r.code, token });
      attach(r, 0);
    });

    on('room:join', (p, reply) => {
      const q = parseJoin(p);
      if (!q.ok) {
        // a malformed link code is a user typo, not abuse: same text as a code that does not exist
        const badCode = q.field === 'code' && typeof p === 'object' && p !== null && 'code' in p && typeof p.code === 'string';
        return badCode ? reply({ error: LINK_GONE }) : reject(reply);
      }
      const { code, name, token } = q.v;
      const target = rooms.get(code);
      if (!target) return reply({ error: LINK_GONE });
      const find = () => (token ? target.seats.findIndex(s => s && s.token === token) : -1);
      const existing = find();
      // the client sends room:join twice on every load; the same socket re-joining its own seat must not release it
      if (!(existing >= 0 && owned() && room === target && seatIdx === existing)) {
        release();
        if (rooms.get(code) !== target) return reply({ error: LINK_GONE });
      }
      const seat = find();
      if (seat >= 0 && token) { reply({ token }); return attach(target, seat as PIdx); }
      const free = target.seats.findIndex(s => !s);
      if (free < 0 || target.phase !== 'lobby') return reply({ error: 'This match is already full.' });
      const t = newToken();
      target.seats[free] = { token: t, name: clean(name, `Player ${free + 1}`), house: null, ready: false, deck: null, socketId: null, isBot: false };
      reply({ token: t });
      attach(target, free as PIdx);
    });

    on('lobby:house', (p, reply) => {
      const q = parseHouse(p);
      if (!q.ok) return reject(reply);
      const m = mine(reply, 'lobby');
      if (!m) return;
      if (m.s.house !== q.v) m.s.deck = null;
      m.s.house = q.v; m.s.ready = false;
      sendRoom(m.r);
    });

    on('lobby:deck', (p, reply) => {
      const q = parseDeck(p);
      if (!q.ok) return reject(reply);
      const m = mine(reply, 'lobby');
      if (!m) return;
      const ids = q.v;
      if (ids === null) { m.s.deck = null; m.s.ready = false; sendRoom(m.r); return reply({ ok: true }); }
      if (m.r.vsBot) return reply({ error: 'Matches against the bot use the starter deck.' });
      if (!m.s.house) return reply({ error: 'Pick a house first.' });
      const err = validateDeck(m.s.house, ids);
      if (err) return reply({ error: err });
      m.s.deck = ids; m.s.ready = false;
      sendRoom(m.r);
      reply({ ok: true });
    });

    on('lobby:ready', (p, reply) => {
      const q = parseReady(p);
      if (!q.ok) return reject(reply);
      const m = mine(reply, 'lobby');
      if (!m || !m.s.house) return;
      m.s.ready = q.v;
      const bot = m.r.seats.find(x => x?.isBot);
      if (bot) {
        const others = ALL_HOUSES.filter(h => h !== m.s.house);
        bot.house = others[Math.floor(Math.random() * others.length)];
      }
      sendRoom(m.r);
      if (m.r.seats.every(x => x?.ready && x.house)) startGame(m.r);
    });

    on('game:action', (p, reply) => {
      const q = parseAction(p);
      if (!q.ok) return reject(reply);
      const m = mine(reply);
      if (!m) return;
      const err = act(m.r, m.i, q.v);
      reply(err ? { error: err } : { ok: true });
    });

    on('game:forfeit', (_p, reply) => {
      const m = mine(reply, 'playing');
      if (m) endByForfeit(m.r, m.i);
    });

    on('game:rematch', (_p, reply) => {
      const m = mine(reply, 'over');
      if (!m) return;
      const { r, i } = m;
      r.rematch[i] = true;
      r.seats.forEach((s, k) => { if (s?.isBot) r.rematch[k] = true; });
      if (r.rematch[0] && r.rematch[1]) {
        r.phase = 'lobby'; r.game = null; r.rematch = [false, false];
        r.seats.forEach(s => { if (s && !s.isBot) s.ready = false; });
        sendGame(r, []);
      }
      sendRoom(r);
    });

    on('room:leave', () => { release(); });
    on('disconnect', () => { drop(false); });

    function drop(leaving: boolean) {
      const r = room, i = seatIdx;
      if (!r || i === null) return;
      const s = r.seats[i];
      if (!s || s.socketId !== socket.id) return;
      s.socketId = null;
      room = null; seatIdx = null;
      if (rooms.get(r.code) !== r) return; // ended or deleted (endByServer, deleteRoom, close): no toast, no grace timer
      if (r.phase === 'lobby') {
        if (leaving) r.seats[i] = null;
        if (r.seats.every(x => !x || x.isBot || !x.socketId)) {
          s.dropTimer = setTimeout(guard('drop', r, () => { if (!s.socketId) deleteRoom(r); }), LOBBY_KEEP_MS);
        }
        sendRoom(r);
        return;
      }
      if (r.phase === 'playing') {
        if (leaving) return endByForfeit(r, i);
        io.to(r.code).emit('toast', `${s.name} disconnected. They have 60 seconds to come back.`);
        s.dropTimer = setTimeout(guard('drop', r, () => { if (!s.socketId) endByForfeit(r, i); }), limits.dropGraceMs);
        sendRoom(r);
      }
    }
  });

  // sweep idle rooms
  const sweeper = setInterval(() => {
    try {
      const now = Date.now();
      for (const r of [...rooms.values()]) {
        guard('sweep', r, () => {
          const anyone = r.seats.some(s => s && !s.isBot && s.socketId);
          if (!anyone && now - r.touched > limits.roomIdleMs) deleteRoom(r);
        })();
      }
    } catch (e) {
      logError(log, 'timer:sweep', e);
    }
  }, limits.sweepEveryMs);
  sweeper.unref();

  return {
    health,
    listen: port => new Promise<number>((resolve, reject) => {
      http.once('error', reject);
      http.listen(port, () => {
        http.off('error', reject);
        const addr = http.address();
        resolve(typeof addr === 'object' && addr ? (addr as AddressInfo).port : port);
      });
    }),
    close: async () => {
      clearInterval(sweeper);
      for (const r of [...rooms.values()]) deleteRoom(r);
      await new Promise<void>(resolve => { void io.close(() => resolve()); http.closeAllConnections(); });
    },
  };
}
