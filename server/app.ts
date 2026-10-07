// AFTERLIGHT game server factory: rooms, matchmaking by link, authoritative rules, bot opponent.
// Every inbound event is parsed (shared/protocol.ts) before use; every timer runs under guard().
import express from 'express';
import { createServer, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io';
import { ALL_HOUSES, House, validateDeck } from '../shared/cards';
import { GEvent, GameState, PIdx, PlayerView, applyAction, createGame, forfeit, viewFor } from '../shared/engine';
import { decide } from '../shared/bot';
import {
  BAD_REQUEST, GENERIC_ERROR, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
  parseAction, parseCreate, parseDeck, parseDevice, parseHouse, parseJoin, parseReady,
} from '../shared/protocol';
import type { ClientToServer, DeviceClass, RoomSnapshot, ServerEndReason, ServerToClient } from '../shared/protocol';
import { DEFAULT_LIMITS, FixedWindow, clientIp, ipKey, type ServerLimits, type TrustProxy } from './limits';
import { consoleSink, logError, type LogLine, type LogSink } from './log';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIST = path.resolve(__dirname, '../dist');
const TOO_MANY_CREATES = 'Too many new matches, try again in a minute.';
const TOO_MANY_CONNECTIONS = 'Too many connections from your network. Try again later.';
const FULL = 'AFTERLIGHT is full right now. Try again in a few minutes.';
const LINK_GONE = 'That match link has expired or never existed.';
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
  /** how the client IP is read; default 'none' */
  trustProxy?: TrustProxy;
  log?: LogSink;
  botDelayMs?: (events: GEvent[]) => number;
  hooks?: ServerHooks;
  /** shown in /health; default 'dev' */
  buildSha?: string;
}
export interface HealthJson {
  ok: true; sha: string; uptimeS: number; rooms: number; sockets: number;
  memMB: { rss: number; heapUsed: number };
  counts: { connects: number; roomsCreated: number; matchesStarted: number; matchesEndedNormal: number; errors: number; rejected: number; limited: number };
}
type MatchEnd = 'normal' | 'forfeit' | 'leave' | 'disconnect' | 'error' | 'idle';
interface SocketData { ipKey: string; cid: string; device: DeviceClass | 'unknown' }
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
  /** when the last connected human left; null while one is connected */
  emptySince: number | null;
  /** match number in this room, from 1 */
  n: number;
  /** a match_start was logged and its match_end has not been */
  matchOpen: boolean;
  startedAt: number;
  /** accepted card plays per seat in the current match */
  plays: [number, number];
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
  const baseLog = opts.log ?? consoleSink;
  const counts: HealthJson['counts'] = { connects: 0, roomsCreated: 0, matchesStarted: 0, matchesEndedNormal: 0, errors: 0, rejected: 0, limited: 0 };
  /** every line goes through here so /health can count errors */
  const log: LogSink = line => { if (line.message === 'error') counts.errors++; baseLog(line); };
  const info = (message: string, extra: Record<string, unknown>) => {
    const line: LogLine = { level: 'info', message, ts: new Date().toISOString(), ...extra };
    try { log(line); } catch (e) { logError(baseLog, 'log:' + message, e); }
  };
  const trustProxy: TrustProxy = opts.trustProxy ?? 'none';
  const buildSha = opts.buildSha ?? 'dev';
  const socketCreates = new FixedWindow(60_000, limits.createsPerSocketPerMin);
  const ipCreates = new FixedWindow(60_000, limits.createsPerIpPerMin);
  const badRequestLog = new FixedWindow(60_000, 1);
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
  const health = (): HealthJson => {
    const m = process.memoryUsage();
    return {
      ok: true, sha: buildSha, uptimeS: Math.floor((Date.now() - bootedAt) / 1000), rooms: rooms.size, sockets: io.of('/').sockets.size,
      memMB: { rss: Math.round(m.rss / 1_048_576), heapUsed: Math.round(m.heapUsed / 1_048_576) },
      counts: { ...counts },
    };
  };
  app.get('/health', (_req, res) => { res.json(health()); });
  if (distDir && fs.existsSync(distDir)) {
    const dist = distDir;
    app.use(express.static(dist, { maxAge: '1h', index: false, setHeaders: (res, file) => { if (file.endsWith('manifest.json')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.use('/art', (_req, res) => { res.status(404).end(); });
    app.use((_req, res) => { res.sendFile('index.html', { root: dist }); });
  }
  const http = createServer(app);
  // Raw engine.io connections per IP, counted from the handshake to the close. The bound stays above maxSocketsPerIp for
  // every value (twice it, and at least one more), so a browser over the namespace cap still reaches the middleware and
  // gets its friendly connect_error text.
  const engineConns = new Map<string, number>();
  const engineCap = Math.max(2 * limits.maxSocketsPerIp, limits.maxSocketsPerIp + 1);
  const engineKey = (headers: IncomingHttpHeaders, remote: string | undefined) => ipKey(clientIp(headers, remote ?? '', trustProxy));
  const io = new Server<ListenEvents, ServerToClient, DefaultEventsMap, SocketData>(http, {
    cors: { origin: true },
    maxHttpBufferSize: 1_000_000,
    allowRequest: (req, cb) => {
      try {
        const key = engineKey(req.headers, req.socket.remoteAddress);
        if ((engineConns.get(key) ?? 0) >= engineCap) { counts.limited++; return cb(TOO_MANY_CONNECTIONS, false); }
        cb(null, true);
      } catch (e) {
        logError(log, 'allowRequest', e);
        cb(GENERIC_ERROR, false);
      }
    },
  });
  /** engine connections that have sent a Socket.IO CONNECT (unmarked when their namespace socket disconnects) */
  const connectSeen = new WeakSet<object>();
  type EngineConn = Socket<ListenEvents, ServerToClient, DefaultEventsMap, SocketData>['conn'];
  io.engine.on('connection', (conn: EngineConn) => {
    try {
      const key = engineKey(conn.request.headers, conn.request.socket.remoteAddress);
      engineConns.set(key, (engineConns.get(key) ?? 0) + 1);
      conn.once('close', () => {
        const n = (engineConns.get(key) ?? 1) - 1;
        if (n <= 0) engineConns.delete(key); else engineConns.set(key, n);
      });
      // Guard at the packet level, not in the middleware: socket.io builds a Socket for every CONNECT in a payload before the
      // middleware runs, and engine.io emits 'packet' before socket.io sees it. close() drops the rest of the payload at once.
      conn.on('packet', (p: { type: string; data?: unknown }) => {
        try {
          if (p.type !== 'message' || typeof p.data !== 'string' || !p.data.startsWith('0')) return;
          if (connectSeen.has(conn)) { counts.limited++; conn.close(); return; }
          connectSeen.add(conn);
        } catch (e) {
          logError(log, 'engine:packet', e);
          try { conn.close(); } catch (e2) { logError(log, 'engine:packet:close', e2); }
        }
      });
    } catch (e) {
      logError(log, 'engine:connection', e);
    }
  });

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
      if (r.game) endByServer(r, 'error');
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
      finishMatch(r, 'error');
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
    finishMatch(r, reason);
    r.seats.forEach(s => { if (s?.socketId) io.sockets.sockets.get(s.socketId)?.leave(r.code); });
    deleteRoom(r);
  }

  /** The only place a match_end line is written; r.matchOpen makes it fire once per match. */
  function finishMatch(r: Room, reason: MatchEnd) {
    if (!r.matchOpen) return;
    r.matchOpen = false;
    if (reason === 'normal') counts.matchesEndedNormal++;
    const g = r.game;
    const winner = reason === 'error' || reason === 'idle' ? null : g?.winner ?? null;
    const botSeat = r.seats.findIndex(s => s?.isBot);
    info('match_end', {
      rid: r.rid, n: r.n, vsBot: r.vsBot, reason, winner, rounds: g ? g.results.map(x => x.scores) : [],
      ms: Date.now() - r.startedAt, plays: r.plays, botSeat: botSeat < 0 ? null : botSeat,
    });
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
    r.n++; r.matchOpen = true; r.startedAt = Date.now(); r.plays = [0, 0];
    counts.matchesStarted++;
    const botSeat = r.seats.findIndex(s => s?.isBot);
    info('match_start', { rid: r.rid, n: r.n, vsBot: r.vsBot, houses: [a.house, b.house], first: state.first, botSeat: botSeat < 0 ? null : botSeat });
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
    if (g.over) { r.phase = 'over'; clearTimeout(r.idleTimer); finishMatch(r, 'normal'); sendRoom(r); return; }
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
    if (a.type === 'play') r.plays[p]++;
    if (!r.seats[p]?.isBot) armIdle(r);
    scheduleTurn(r, res.events);
    sendGame(r, res.events);
    return null;
  }

  function endByForfeit(r: Room, loser: PIdx, reason: 'forfeit' | 'leave' | 'disconnect') {
    if (!r.game || r.game.over) return;
    const ev = forfeit(r.game, loser);
    clearTimers(r);
    r.deadline = null; r.phase = 'over';
    if (!r.seats.some(s => s && !s.isBot && s.socketId)) r.emptySince = Date.now();
    finishMatch(r, reason);
    sendGame(r, ev);
    sendRoom(r);
  }

  // ----------------------------------------------------------- sockets
  // Admission: the socket cap and the per-IP cap. Counted live from the connected sockets, so there is no counter to leak.
  io.use((socket, next) => {
    try {
      /** refuse, and close the engine connection once the error has been flushed, so a refused client holds no slot */
      const refuse = (msg: string) => {
        counts.limited++;
        next(new Error(msg));
        setImmediate(() => { try { socket.conn.close(); } catch (e) { logError(log, 'refuse:close', e); } });
      };
      const raw = clientIp(socket.handshake.headers, socket.handshake.address, trustProxy);
      if (trustProxy === 'x-real-ip' && raw === socket.handshake.address) {
        const now = Date.now();
        if (badRequestLog.can('ip_fallback', now)) { // header missing or invalid: no IP values in the line
          badRequestLog.add('ip_fallback', now);
          log({ level: 'warn', message: 'ip_fallback', ts: new Date(now).toISOString() });
        }
      }
      const ip = ipKey(raw);
      socket.data = { ipKey: ip, cid: newRid(), device: parseDevice(socket.handshake.auth) };
      let same = 0;
      for (const o of io.of('/').sockets.values()) if (o.data.ipKey === ip) same++;
      if (same >= limits.maxSocketsPerIp) return refuse(TOO_MANY_CONNECTIONS);
      if (io.engine.clientsCount > limits.maxSockets) return refuse(FULL);
      next();
    } catch (e) {
      logError(log, 'middleware', e);
      next(new Error(GENERIC_ERROR));
    }
  });

  io.on('connection', (socket: Socket<ListenEvents, ServerToClient, DefaultEventsMap, SocketData>) => {
    counts.connects++;
    socket.once('disconnect', () => { connectSeen.delete(socket.conn); });
    info('connect', { cid: socket.data.cid, device: socket.data.device });
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
      r.emptySince = null;
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
          if (room && owned() && room.phase !== 'lobby') failRoom(room);
        }
      });
    };
    /** The one place a bad payload is answered, counted and logged (event and field, never the value). */
    const reject = (reply: Reply, event: string, field: string) => {
      counts.rejected++;
      const key = `${event}|${field}`;
      const now = Date.now();
      if (badRequestLog.can(key, now)) {
        badRequestLog.add(key, now);
        log({ level: 'warn', message: 'bad_request', ts: new Date(now).toISOString(), event, field });
      }
      reply({ error: BAD_REQUEST });
    };

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
      if (!q.ok) return reject(reply, 'room:create', q.field);
      release();
      const now = Date.now();
      if (!socketCreates.can(socket.data.cid, now) || !ipCreates.can(socket.data.ipKey, now)) {
        counts.limited++;
        return reply({ error: TOO_MANY_CREATES });
      }
      if (rooms.size >= limits.maxRooms) { counts.limited++; return reply({ error: FULL }); }
      socketCreates.add(socket.data.cid, now);
      ipCreates.add(socket.data.ipKey, now);
      const r: Room = {
        code: newCode(), rid: newRid(), vsBot: q.v.vsBot, seats: [null, null], phase: 'lobby', game: null, seq: 0,
        deadline: null, rematch: [false, false], touched: Date.now(),
        emptySince: null, n: 0, matchOpen: false, startedAt: 0, plays: [0, 0],
      };
      const token = newToken();
      r.seats[0] = { token, name: clean(q.v.name, 'Player 1'), house: null, ready: false, deck: null, socketId: null, isBot: false };
      if (r.vsBot) r.seats[1] = { token: newToken(), name: 'Afterlight Bot', house: null, ready: true, deck: null, socketId: null, isBot: true };
      rooms.set(r.code, r);
      counts.roomsCreated++;
      info('room_create', { rid: r.rid, cid: socket.data.cid, vsBot: r.vsBot });
      reply({ code: r.code, token });
      attach(r, 0);
    });

    on('room:join', (p, reply) => {
      const q = parseJoin(p);
      if (!q.ok) {
        // a short malformed link code is a user typo, not abuse: same text as a code that does not exist
        const typo = q.field === 'code' && typeof p === 'object' && p !== null && 'code' in p && typeof p.code === 'string' && p.code.length <= 16;
        return typo ? reply({ error: LINK_GONE }) : reject(reply, 'room:join', q.field);
      }
      const { code, name, token } = q.v;
      const target = rooms.get(code);
      if (!target) return reply({ error: LINK_GONE });
      const find = () => (token ? target.seats.findIndex(s => s && s.token === token) : -1);
      const existing = find();
      // a join that cannot succeed must not cost the socket its current match: your own seat, or a free seat in a lobby
      if (existing < 0 && (target.phase !== 'lobby' || target.seats.every(x => x))) return reply({ error: 'This match is already full.' });
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
      if (!q.ok) return reject(reply, 'lobby:house', q.field);
      const m = mine(reply, 'lobby');
      if (!m) return;
      if (m.s.house !== q.v) m.s.deck = null;
      m.s.house = q.v; m.s.ready = false;
      sendRoom(m.r);
    });

    on('lobby:deck', (p, reply) => {
      const q = parseDeck(p);
      if (!q.ok) return reject(reply, 'lobby:deck', q.field);
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
      if (!q.ok) return reject(reply, 'lobby:ready', q.field);
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
      if (!q.ok) return reject(reply, 'game:action', q.field);
      const m = mine(reply);
      if (!m) return;
      const err = act(m.r, m.i, q.v);
      reply(err ? { error: err } : { ok: true });
    });

    on('game:forfeit', (_p, reply) => {
      const m = mine(reply, 'playing');
      if (m) endByForfeit(m.r, m.i, 'forfeit');
    });

    on('game:rematch', (_p, reply) => {
      const m = mine(reply, 'over');
      if (!m) return;
      const { r, i } = m;
      r.rematch[i] = true;
      r.seats.forEach((s, k) => { if (s?.isBot) r.rematch[k] = true; });
      if (r.rematch[0] && r.rematch[1]) {
        info('rematch', { rid: r.rid, n: r.n + 1 });
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
      socket.leave(r.code);
      if (rooms.get(r.code) !== r) return; // ended or deleted (endByServer, deleteRoom, close): no toast, no grace timer
      if (!r.seats.some(x => x && !x.isBot && x.socketId)) r.emptySince = Date.now();
      if (r.phase === 'lobby') {
        if (leaving) r.seats[i] = null; // an empty lobby is swept after lobbyIdleMs (emptySince)
        sendRoom(r);
        return;
      }
      if (r.phase === 'playing') {
        if (leaving) return endByForfeit(r, i, 'leave');
        io.to(r.code).emit('toast', `${s.name} disconnected. They have 60 seconds to come back.`);
        s.dropTimer = setTimeout(guard('drop', r, () => { if (!s.socketId) endByForfeit(r, i, 'disconnect'); }), limits.dropGraceMs);
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
          if (anyone) return;
          if (now - r.touched > limits.roomIdleMs) return deleteRoom(r);
          if (r.phase !== 'playing' && now - (r.emptySince ?? r.touched) >= limits.lobbyIdleMs) deleteRoom(r);
        })();
      }
      socketCreates.prune(now); ipCreates.prune(now); badRequestLog.prune(now);
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
