// Test seams for server tests (PR 2a). Real servers on a random port, real Socket.IO clients, no fake timers.
// Not imported by production code.
import WebSocket from 'ws';
import { io, type Socket } from 'socket.io-client';
import { CARDS, type House } from '../shared/cards';
import { activeEffect, legalRows, targetSpecFor, type Action, type PlayerView } from '../shared/engine';
import type { DeviceClass, GameMsg } from '../shared/protocol';
import { createGameServer, type GameServer, type ServerOptions } from './app';

/** A captured log line. Always carries level, message and ts; other fields depend on the message. */
export interface LogLine { level: string; message: string; ts?: unknown; [k: string]: unknown }

export interface Booted { url: string; srv: GameServer; logs: LogLine[] }

/**
 * Boot one isolated server on a random port. Defaults: API only (no dist), instant bot (`botDelayMs: () => 0`).
 * Every log line is captured in `logs` (and still forwarded to `opts.log` if given).
 * Callers must `await srv.close()`.
 */
export async function bootServer(opts: ServerOptions = {}): Promise<Booted> {
  const logs: LogLine[] = [];
  const srv = createGameServer({
    distDir: null,
    botDelayMs: () => 0,
    ...opts,
    log: line => { logs.push(line as unknown as LogLine); opts.log?.(line); },
  });
  const port = await srv.listen(0);
  return { url: `http://127.0.0.1:${port}`, srv, logs };
}

// ------------------------------------------------------------------ event recording
// Every client records every event it receives, so a test that awaits an ack and only then awaits an event
// cannot lose an event that arrived in between.
interface Rec {
  all: Map<string, unknown[]>;
  cursor: Map<string, number>;
  waiters: Set<() => void>;
}
const recs = new WeakMap<Socket, Rec>();

function recOf(s: Socket): Rec {
  const r = recs.get(s);
  if (!r) throw new Error('socket was not created by testkit.client()');
  return r;
}

/**
 * A websocket-only client (no auto-reconnect, so a server-side disconnect stays visible).
 * `ip` is sent as X-Real-IP (only meaningful with trustProxy 'x-real-ip', 2b); `device` goes in the handshake auth.
 */
export function client(url: string, opts: { ip?: string; device?: DeviceClass } = {}): Socket {
  const s = io(url, {
    forceNew: true,
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: opts.ip ? { 'x-real-ip': opts.ip } : undefined,
    auth: opts.device ? { device: opts.device } : undefined,
  });
  const rec: Rec = { all: new Map(), cursor: new Map(), waiters: new Set() };
  recs.set(s, rec);
  const push = (ev: string, payload: unknown) => {
    const arr = rec.all.get(ev) ?? [];
    arr.push(payload);
    rec.all.set(ev, arr);
    for (const w of [...rec.waiters]) w();
  };
  s.onAny((ev: string, ...args: unknown[]) => push(ev, args[0]));
  s.on('connect', () => push('connect', undefined));
  s.on('disconnect', (reason: string) => push('disconnect', reason));
  s.on('connect_error', (err: Error) => push('connect_error', err.message));
  return s;
}

/** Emit with an ack and wait for it. Rejects after `ms` with no reply. The payload may be anything, including junk. */
export function ask(s: Socket, ev: string, payload?: unknown, ms = 1000): Promise<unknown> {
  return s.timeout(ms).emitWithAck(ev, payload);
}

/**
 * Resolve with the first payload of `ev` that satisfies `pred`, looking at events already received
 * (that this socket's earlier next() calls for the same event have not passed) and at future ones.
 * A match consumes it and everything before it for that event name. Rejects after `ms`.
 * 'connect' and 'disconnect' (payload: reason) are recorded too.
 */
export function next<T = unknown>(s: Socket, ev: string, pred: (payload: T) => boolean = () => true, ms = 2000): Promise<T> {
  const rec = recOf(s);
  return new Promise<T>((resolve, reject) => {
    let from = rec.cursor.get(ev) ?? 0;
    let timer: NodeJS.Timeout | undefined;
    const finish = () => { rec.waiters.delete(scan); clearTimeout(timer); };
    function scan() {
      const arr = rec.all.get(ev) ?? [];
      try {
        for (; from < arr.length; from++) {
          const p = arr[from] as T;
          if (pred(p)) {
            rec.cursor.set(ev, from + 1);
            finish();
            resolve(p);
            return;
          }
        }
      } catch (e) { finish(); reject(e); }
    }
    timer = setTimeout(() => { finish(); reject(new Error(`timed out after ${ms} ms waiting for "${ev}"`)); }, ms);
    rec.waiters.add(scan);
    scan();
  });
}

/** Every payload of `ev` this socket has ever received, consumed or not, in arrival order. */
export function received<T = unknown>(s: Socket, ev: string): T[] {
  return [...(recOf(s).all.get(ev) ?? [])] as T[];
}

// ------------------------------------------------------------------ flows
/**
 * Create a bot room, pick `house`, ready up, and wait until it is the human's turn.
 * `game` is that first my-turn message, so a test can act on it right away.
 */
export async function startBotMatch(url: string, ip?: string, house: House = 'COVEN') {
  const s = client(url, { ip });
  await next(s, 'connect');
  const created = await ask(s, 'room:create', { name: 'Ann', vsBot: true });
  if (!created || typeof created !== 'object' || !('code' in created) || !('token' in created)
    || typeof created.code !== 'string' || typeof created.token !== 'string') {
    throw new Error('room:create failed: ' + JSON.stringify(created));
  }
  const { code, token } = created;
  s.emit('lobby:house', house);
  s.emit('lobby:ready', true);
  const game = await next<GameMsg>(s, 'game', g => g.view.current === g.view.me && !g.view.over && g.ended === undefined, 3000);
  return { s, code, token, house, game };
}

/**
 * A play that needs no target: the first unit in hand whose active effect has `targetSpecFor(...).kind === 'none'`,
 * on its first legal row. Otherwise `{ type: 'pass' }`.
 */
export function firstSimplePlay(view: PlayerView): Action {
  const me = view.me;
  const opp = view.players[me === 0 ? 1 : 0];
  for (const c of view.players[me].hand ?? []) {
    const def = CARDS[c.cardId];
    if (def.kind !== 'unit') continue;
    const { eff } = activeEffect(def, opp.passed);
    if (targetSpecFor(view, me, eff).kind !== 'none') continue;
    const row = legalRows(view, me, def)[0];
    if (!row) continue;
    return { type: 'play', uid: c.uid, row };
  }
  return { type: 'pass' };
}

// ------------------------------------------------------------------ 2b helpers
/**
 * ServerOptions with fields PR 2b adds (`trustProxy`, `buildSha`, abuse limits). A cast, so the tests typecheck
 * before and after 2b; before 2b the server ignores the extra fields and the tests fail on behaviour.
 */
export const as2b = (o: object): ServerOptions => o as ServerOptions;

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** GET /health as an object (status must be 200). */
export async function health(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${url}/health`);
  if (res.status !== 200) throw new Error(`/health answered ${res.status}`);
  const j: unknown = await res.json();
  if (!isRec(j)) throw new Error('/health is not an object');
  return j;
}

export async function roomCount(url: string): Promise<number> {
  const n = (await health(url)).rooms;
  if (typeof n !== 'number') throw new Error('/health.rooms is not a number');
  return n;
}

/** Poll `read` until it returns `want` (deep equality by JSON), or throw with the last value after `ms`. */
export async function until<T>(what: string, read: () => Promise<T> | T, want: T, ms = 3000): Promise<void> {
  const t0 = Date.now();
  let last: T = await read();
  while (JSON.stringify(last) !== JSON.stringify(want)) {
    if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what} to be ${JSON.stringify(want)} (last: ${JSON.stringify(last)})`);
    await sleep(25);
    last = await read();
  }
}

/** The created room's `{code, token}`, or throws with what came back. */
export async function createRoom(s: Socket, vsBot: boolean, name = 'Ann'): Promise<{ code: string; token: string }> {
  const r = await ask(s, 'room:create', { name, vsBot });
  if (!isRec(r) || typeof r.code !== 'string' || typeof r.token !== 'string') throw new Error('room:create failed: ' + JSON.stringify(r));
  return { code: r.code, token: r.token };
}

/** Two sockets in a started PvP match: a (creator, seat 0, COVEN) and b (joiner, seat 1, ORDER). */
export async function pvpMatch(url: string, o: { nameA?: string; nameB?: string; ipA?: string; ipB?: string } = {}) {
  const a = client(url, { ip: o.ipA }), b = client(url, { ip: o.ipB });
  await Promise.all([next(a, 'connect'), next(b, 'connect')]);
  const { code, token: tokenA } = await createRoom(a, false, o.nameA ?? 'Ann');
  const joined = await ask(b, 'room:join', { code, name: o.nameB ?? 'Bo' });
  if (!isRec(joined) || typeof joined.token !== 'string') throw new Error('join failed: ' + JSON.stringify(joined));
  a.emit('lobby:house', 'COVEN'); b.emit('lobby:house', 'ORDER');
  a.emit('lobby:ready', true); b.emit('lobby:ready', true);
  const [ga, gb] = await Promise.all([next<GameMsg>(a, 'game', () => true, 3000), next<GameMsg>(b, 'game', () => true, 3000)]);
  return { a, b, code, tokenA, tokenB: joined.token, ga, gb };
}

export const isMyTurn = (g: GameMsg) => g.view.current === g.view.me && !g.view.over && g.ended === undefined;

/** Human passes every turn (never plays a card) until the match is over or the server ended it. Returns the last message. */
export async function passUntilEnd(s: Socket, first: GameMsg): Promise<GameMsg> {
  let g = first;
  for (let i = 0; i < 30; i++) {
    if (g.ended || g.view.over) return g;
    if (isMyTurn(g)) await ask(s, 'game:action', { type: 'pass' });
    g = await next<GameMsg>(s, 'game', m => m.ended !== undefined || m.view.over || isMyTurn(m), 3000);
  }
  throw new Error('match never ended by passing');
}

/**
 * A raw engine.io websocket (no Socket.IO client): resolves with it once the engine "open" packet arrives,
 * or with `null` if the server refused the upgrade. It never sends a namespace CONNECT unless the test does.
 */
export function rawEngine(url: string, ip?: string): Promise<WebSocket | null> {
  const ws = new WebSocket(`${url.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`, { headers: ip ? { 'x-real-ip': ip } : {} });
  return new Promise(resolve => {
    ws.once('message', () => resolve(ws));
    ws.once('error', () => resolve(null));
    ws.once('unexpected-response', () => { ws.terminate(); resolve(null); });
  });
}
