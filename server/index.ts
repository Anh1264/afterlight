// AFTERLIGHT game server: rooms, matchmaking by link, authoritative rules, bot opponent.
import express from 'express';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import { ALL_HOUSES, House, validateDeck } from '../shared/cards';
import { GEvent, GameState, PIdx, applyAction, createGame, forfeit, viewFor } from '../shared/engine';
import { decide } from '../shared/bot';
import type { ClientToServer, RoomSnapshot, ServerToClient } from '../shared/protocol';
import { TURN_SECONDS } from '../shared/protocol';

const PORT = Number(process.env.PORT ?? 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');

interface Seat {
  token: string;
  name: string;
  house: House | null;
  ready: boolean;
  deck: string[] | null;
  socketId: string | null;
  isBot: boolean;
  dropTimer?: NodeJS.Timeout;
}

interface Room {
  code: string;
  vsBot: boolean;
  seats: [Seat | null, Seat | null];
  phase: 'lobby' | 'playing' | 'over';
  game: GameState | null;
  seq: number;
  deadline: number | null;
  turnTimer?: NodeJS.Timeout;
  botTimer?: NodeJS.Timeout;
  rematch: [boolean, boolean];
  touched: number;
}

const rooms = new Map<string, Room>();
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => {
  for (;;) {
    const c = Array.from(randomBytes(5), b => ALPHA[b % ALPHA.length]).join('');
    if (!rooms.has(c)) return c;
  }
};
const newToken = () => randomBytes(16).toString('hex');
const clean = (s: unknown, fallback: string) => String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 18) || fallback;

const app = express();
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h', index: false, setHeaders: (res, file) => { if (file.endsWith('manifest.json')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.use('/art', (_req, res) => { res.status(404).end(); });
  app.use((_req, res) => res.sendFile('index.html', { root: DIST }));
}
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: true } });

// ------------------------------------------------------------- broadcasting
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
  if (!r.game) return;
  r.seq++;
  r.seats.forEach((s, i) => {
    if (s?.socketId) io.to(s.socketId).emit('game', { seq: r.seq, view: viewFor(r.game!, i as PIdx), events, deadline: r.deadline });
  });
}

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

// ------------------------------------------------------------- game flow
function startGame(r: Room) {
  const [a, b] = r.seats as [Seat, Seat];
  const { state, events } = createGame({ houses: [a.house!, b.house!], names: [a.name, b.name], decks: [a.deck, b.deck] });
  r.game = state; r.phase = 'playing'; r.seq = 0; r.rematch = [false, false];
  sendRoom(r);
  scheduleTurn(r, events);
  sendGame(r, events);
}

function scheduleTurn(r: Room, events: GEvent[]) {
  clearTimeout(r.turnTimer); clearTimeout(r.botTimer);
  const g = r.game!;
  r.deadline = null;
  if (g.over) { r.phase = 'over'; sendRoom(r); return; }
  const seat = r.seats[g.current]!;
  const delay = animTime(events);
  if (seat.isBot) {
    r.botTimer = setTimeout(() => {
      if (!r.game || r.game.over) return;
      const p = r.game.current;
      const a = decide(r.game, p);
      act(r, p, a);
    }, delay + 500 + Math.random() * 700);
  } else {
    r.deadline = Date.now() + delay + TURN_SECONDS * 1000;
    r.turnTimer = setTimeout(() => {
      if (!r.game || r.game.over) return;
      io.to(seat.socketId ?? '').emit('toast', 'Time ran out — you passed.');
      act(r, r.game.current, { type: 'pass' });
    }, r.deadline - Date.now());
  }
}

function act(r: Room, p: PIdx, a: Parameters<typeof applyAction>[2]): string | null {
  if (!r.game) return 'No game running.';
  const res = applyAction(r.game, p, a);
  if ('error' in res) return res.error;
  r.touched = Date.now();
  scheduleTurn(r, res.events);
  sendGame(r, res.events);
  return null;
}

function endByForfeit(r: Room, loser: PIdx) {
  if (!r.game || r.game.over) return;
  const ev = forfeit(r.game, loser);
  clearTimeout(r.turnTimer); clearTimeout(r.botTimer);
  r.deadline = null; r.phase = 'over';
  sendGame(r, ev);
  sendRoom(r);
}

// ------------------------------------------------------------- sockets
io.on('connection', (socket: Socket<ClientToServer, ServerToClient>) => {
  let room: Room | null = null;
  let seatIdx: PIdx | null = null;

  const attach = (r: Room, i: PIdx) => {
    room = r; seatIdx = i;
    const s = r.seats[i]!;
    s.socketId = socket.id;
    clearTimeout(s.dropTimer);
    socket.join(r.code);
    sendRoom(r);
    if (r.game) socket.emit('game', { seq: r.seq, view: viewFor(r.game, i), events: [], deadline: r.deadline });
  };

  socket.on('room:create', ({ name, vsBot }, ack) => {
    const r: Room = {
      code: newCode(), vsBot: !!vsBot, seats: [null, null], phase: 'lobby', game: null, seq: 0,
      deadline: null, rematch: [false, false], touched: Date.now(),
    };
    const token = newToken();
    r.seats[0] = { token, name: clean(name, 'Player 1'), house: null, ready: false, deck: null, socketId: null, isBot: false };
    if (r.vsBot) r.seats[1] = { token: newToken(), name: 'Afterlight Bot', house: null, ready: true, deck: null, socketId: null, isBot: true };
    rooms.set(r.code, r);
    ack({ code: r.code, token });
    attach(r, 0);
  });

  socket.on('room:join', ({ code, name, token }, ack) => {
    const r = rooms.get(String(code).toUpperCase());
    if (!r) return ack({ error: 'That match link has expired or never existed.' });
    const existing = r.seats.findIndex(s => s && token && s.token === token);
    if (existing >= 0) { ack({ token: token! }); return attach(r, existing as PIdx); }
    const free = r.seats.findIndex(s => !s);
    if (free < 0 || r.phase !== 'lobby') return ack({ error: 'This match is already full.' });
    const t = newToken();
    r.seats[free] = { token: t, name: clean(name, `Player ${free + 1}`), house: null, ready: false, deck: null, socketId: null, isBot: false };
    ack({ token: t });
    attach(r, free as PIdx);
  });

  socket.on('lobby:house', h => {
    if (!room || seatIdx === null || room.phase !== 'lobby' || !ALL_HOUSES.includes(h)) return;
    const s = room.seats[seatIdx]!;
    if (s.house !== h) s.deck = null;
    s.house = h; s.ready = false;
    sendRoom(room);
  });

  socket.on('lobby:deck', (ids, ack) => {
    if (!room || seatIdx === null || room.phase !== 'lobby') return ack({ error: 'Not in a lobby.' });
    const s = room.seats[seatIdx]!;
    if (!s.house) return ack({ error: 'Pick a house first.' });
    if (ids === null) { s.deck = null; s.ready = false; sendRoom(room); return ack({ ok: true }); }
    if (!Array.isArray(ids)) return ack({ error: 'Bad deck.' });
    const err = validateDeck(s.house, ids.map(String));
    if (err) return ack({ error: err });
    s.deck = ids.map(String); s.ready = false;
    sendRoom(room);
    ack({ ok: true });
  });

  socket.on('lobby:ready', ready => {
    if (!room || seatIdx === null || room.phase !== 'lobby') return;
    const s = room.seats[seatIdx]!;
    if (!s.house) return;
    s.ready = !!ready;
    const bot = room.seats.find(x => x?.isBot);
    if (bot) {
      const others = ALL_HOUSES.filter(h => h !== s.house);
      bot.house = others[Math.floor(Math.random() * others.length)];
    }
    sendRoom(room);
    if (room.seats.every(x => x?.ready && x.house)) startGame(room);
  });

  socket.on('game:action', (a, ack) => {
    if (!room || seatIdx === null) return ack({ error: 'Not in a match.' });
    const err = act(room, seatIdx, a);
    ack(err ? { error: err } : { ok: true });
  });

  socket.on('game:forfeit', () => { if (room && seatIdx !== null) endByForfeit(room, seatIdx); });

  socket.on('game:rematch', () => {
    if (!room || seatIdx === null || room.phase !== 'over') return;
    room.rematch[seatIdx] = true;
    room.seats.forEach((s, i) => { if (s?.isBot) room!.rematch[i] = true; });
    if (room.rematch[0] && room.rematch[1]) {
      room.phase = 'lobby'; room.game = null; room.rematch = [false, false];
      room.seats.forEach(s => { if (s && !s.isBot) s.ready = false; });
      sendGame(room, []);
    }
    sendRoom(room);
  });

  socket.on('room:leave', () => drop(true));
  socket.on('disconnect', () => drop(false));

  function drop(leaving: boolean) {
    const r = room, i = seatIdx;
    if (!r || i === null) return;
    const s = r.seats[i];
    if (!s || s.socketId !== socket.id) return;
    s.socketId = null;
    room = null; seatIdx = null;
    if (r.phase === 'lobby') {
      if (leaving) r.seats[i] = null;
      if (r.seats.every(x => !x || x.isBot || !x.socketId)) {
        s.dropTimer = setTimeout(() => { if (!s.socketId) rooms.delete(r.code); }, 10 * 60_000);
      }
      sendRoom(r);
      return;
    }
    if (r.phase === 'playing') {
      if (leaving) return endByForfeit(r, i);
      io.to(r.code).emit('toast', `${s.name} disconnected. They have 60 seconds to come back.`);
      s.dropTimer = setTimeout(() => { if (!s.socketId) endByForfeit(r, i); }, 60_000);
      sendRoom(r);
    }
  }
});

// sweep idle rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const anyone = r.seats.some(s => s && !s.isBot && s.socketId);
    if (!anyone && now - r.touched > 30 * 60_000) { clearTimeout(r.turnTimer); clearTimeout(r.botTimer); rooms.delete(code); }
  }
}, 60_000).unref();

http.listen(PORT, () => console.log(`AFTERLIGHT server on :${PORT}${fs.existsSync(DIST) ? ' (serving client)' : ''}`));
