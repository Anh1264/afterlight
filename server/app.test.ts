import { afterEach, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { STARTERS, validateDeck, type House } from '../shared/cards';
import { BAD_REQUEST, GENERIC_ERROR, TURN_SECONDS, type GameMsg, type RoomSnapshot } from '../shared/protocol';
import { mulberry, randomDeck } from '../shared/sim';
import { DEFAULT_LIMITS } from './limits';
import type { ServerOptions } from './app';
import {
  ask, bootServer, client, firstSimplePlay, next, received, startBotMatch,
  type Booted, type LogLine,
} from './testkit';

// Real servers on a random port, real sockets, real (short) timers. Every server and socket is closed after each test.
// Spec: docs/specs/demo-mvp.md, PR 2a (c1, c2, c3, c6, c7, c8).

const booted: Booted[] = [];
const socks: Socket[] = [];

afterEach(async () => {
  for (const s of socks.splice(0)) s.close();
  await Promise.all(booted.splice(0).map(b => b.srv.close()));
});

const boot = async (opts: ServerOptions = {}) => { const b = await bootServer(opts); booted.push(b); return b; };
const connect = async (url: string) => { const s = client(url); socks.push(s); await next(s, 'connect'); return s; };
const bot = async (url: string, house?: House) => { const m = await startBotMatch(url, undefined, house); socks.push(m.s); return m; };
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const errText = (r: unknown): string | undefined => (isObj(r) && typeof r.error === 'string' ? r.error : undefined);
const errorLines = (logs: LogLine[]) => logs.filter(l => l.message === 'error');

async function healthJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${url}/health`);
  expect(res.status).toBe(200);
  const j: unknown = await res.json();
  if (!isObj(j)) throw new Error('/health is not an object');
  return j;
}
async function rooms(url: string): Promise<number> {
  const n = (await healthJson(url)).rooms;
  if (typeof n !== 'number') throw new Error('/health.rooms is not a number');
  return n;
}

const handSize = (g: GameMsg) => g.view.players[g.view.me].hand?.length ?? -1;
const isMyTurn = (g: GameMsg) => g.view.current === g.view.me && !g.view.over && g.ended === undefined;

/** The most recent game message if it is the human's turn, else wait for the next one that is. */
async function untilMyTurn(s: Socket): Promise<GameMsg> {
  const last = received<GameMsg>(s, 'game').at(-1);
  if (last && isMyTurn(last)) return last;
  return next<GameMsg>(s, 'game', isMyTurn, 3000);
}

/** Play one target-free card and wait for the server's game message that carries it. */
async function playOne(s: Socket, from: GameMsg) {
  expect(await ask(s, 'game:action', firstSimplePlay(from.view))).toEqual({ ok: true });
}

/** Keep playing simple cards until a game message with `ended` arrives. */
async function driveUntilEnded(s: Socket, first: GameMsg): Promise<GameMsg> {
  let g = first;
  for (let i = 0; i < 40; i++) {
    expect(await ask(s, 'game:action', firstSimplePlay(g.view))).toEqual({ ok: true });
    g = await next<GameMsg>(s, 'game', m => m.ended !== undefined || isMyTurn(m), 3000);
    if (g.ended) return g;
  }
  throw new Error('match never ended');
}

async function startPvp(url: string) {
  const a = await connect(url), b = await connect(url);
  const created = await ask(a, 'room:create', { name: 'Ann', vsBot: false });
  if (!isObj(created) || typeof created.code !== 'string' || typeof created.token !== 'string') throw new Error('create failed ' + JSON.stringify(created));
  const joined = await ask(b, 'room:join', { code: created.code, name: 'Bo' });
  expect(errText(joined)).toBeUndefined();
  const tokenB = isObj(joined) && typeof joined.token === 'string' ? joined.token : '';
  a.emit('lobby:house', 'COVEN'); b.emit('lobby:house', 'ORDER');
  a.emit('lobby:ready', true); b.emit('lobby:ready', true);
  const [ga, gb] = await Promise.all([next<GameMsg>(a, 'game', () => true, 3000), next<GameMsg>(b, 'game', () => true, 3000)]);
  return { a, b, code: created.code, tokenB, ga, gb };
}

const ENDED_TOAST = 'This match was ended by the server. Go Home to start a new one.';

/** The ended message, the toast for old clients, and the room gone. */
async function expectEndedBy(s: Socket, reason: 'error' | 'idle'): Promise<GameMsg> {
  const m = await next<GameMsg>(s, 'game', g => g.ended !== undefined, 3000);
  expect(m.ended).toBe(reason);
  expect(m.events).toEqual([]);
  expect(m.deadline).toBeNull();
  expect(m.view.players).toHaveLength(2);
  expect(received<string>(s, 'toast')).toContain(ENDED_TOAST);
  return m;
}

// ============================================================================ c1
describe('c1 bad payloads', () => {
  const JUNK_ACTIONS: unknown[] = [null, 'play', { type: 'play', uid: 42 }, { type: 'launch' }];
  const BIG_DECK = Array.from({ length: 10_000 }, (_, i) => `card-${i}`);

  it('c1: junk from a second socket never hurts the server, and socket A can still play a card and get the result', async () => {
    const { url, logs } = await boot();
    const a = await bot(url);
    const b = await connect(url);

    // no ack
    b.emit('game:action');
    for (const p of JUNK_ACTIONS) b.emit('game:action', p);
    b.emit('room:create');
    b.emit('room:join', 12345);
    b.emit('room:join', { code: 12345, name: 'x' });
    b.emit('lobby:deck', BIG_DECK);
    // with an ack (also the barrier: the same socket's events are handled in order)
    for (const p of JUNK_ACTIONS) await ask(b, 'game:action', p);
    await b.timeout(1000).emitWithAck('room:create');
    await ask(b, 'room:join', 12345);
    await ask(b, 'lobby:deck', BIG_DECK);
    // an ack function sitting in the payload slot
    b.emit('room:create', () => undefined);
    b.emit('game:action', () => undefined);
    await ask(b, 'game:action', { type: 'launch' });

    expect(await rooms(url)).toBe(1); // only A's match
    expect(b.connected).toBe(true);
    expect(a.s.connected).toBe(true);
    await playOne(a.s, a.game);
    await next<GameMsg>(a.s, 'game', g => g.events.some(e => e.t === 'play' && e.p === g.view.me));
    expect(errorLines(logs)).toEqual([]);
    expect(await rooms(url)).toBe(1);
  });

  it('c1: junk from the seated socket itself is refused and the match goes on', async () => {
    const { url, logs } = await boot();
    const a = await bot(url);
    for (const p of JUNK_ACTIONS) expect(await ask(a.s, 'game:action', p)).toEqual({ error: BAD_REQUEST });
    expect(await ask(a.s, 'room:create', null)).toEqual({ error: BAD_REQUEST }); // must not release A's seat
    expect(await ask(a.s, 'room:join', 12345)).toEqual({ error: BAD_REQUEST });
    expect(await rooms(url)).toBe(1);
    await playOne(a.s, a.game);
    expect(errorLines(logs)).toEqual([]);
  });

  it('c1: a 1.1 MB message disconnects only its sender; /health answers and A still plays', async () => {
    const { url } = await boot();
    const a = await bot(url);
    const c = await connect(url);
    const b = await connect(url);
    b.emit('lobby:deck', 'x'.repeat(1_100_000));
    await next(b, 'disconnect', () => true, 5000);
    expect(b.connected).toBe(false);
    expect(a.s.connected).toBe(true);
    expect(c.connected).toBe(true);
    expect(received(a.s, 'disconnect')).toEqual([]);
    expect(await rooms(url)).toBe(1);
    await playOne(a.s, a.game);
    await next<GameMsg>(a.s, 'game', g => g.events.some(e => e.t === 'play' && e.p === g.view.me));
  });
});

// ============================================================================ c2
describe('c2 ack errors', () => {
  const BIG_DECK = Array.from({ length: 10_000 }, (_, i) => `card-${i}`);
  const CASES: [string, unknown][] = [
    ['game:action', null], ['game:action', 'play'], ['game:action', { type: 'play', uid: 42 }], ['game:action', { type: 'launch' }],
    ['room:create', undefined], ['room:create', 'x'], ['room:create', { name: 5, vsBot: 'y' }],
    ['room:join', 12345], ['room:join', { code: 12345, name: 'x' }], ['room:join', null],
    ['lobby:deck', BIG_DECK], ['lobby:deck', 'nope'], ['lobby:deck', [1, 2, 3]],
  ];
  const LEAKS = /\bat \S+ \(|node_modules|\.tsx?:\d+|TypeError|RangeError|ReferenceError|Error:|stack/i;

  it('c2: each bad payload sent with an ack gets {error: BAD_REQUEST} within 1 s, with no stack or internal text', async () => {
    const { url } = await boot();
    const a = await bot(url);
    const b = await connect(url);
    for (const who of [b, a.s]) {
      for (const [ev, payload] of CASES) {
        const t0 = Date.now();
        const res = await ask(who, ev, payload, 1000);
        expect(Date.now() - t0, `${ev} ${JSON.stringify(payload)?.slice(0, 40)}`).toBeLessThan(1000);
        expect(res, ev).toEqual({ error: BAD_REQUEST });
        expect(JSON.stringify(res)).not.toMatch(LEAKS);
      }
    }
    expect(await rooms(url)).toBe(1);
  });

  it('c2: an error thrown inside a handler gets {error: GENERIC_ERROR}; no stack, path or message reaches the client; one error line', async () => {
    let armed = false;
    const { url, logs } = await boot({
      hooks: { onHandler: ev => { if (armed && ev === 'room:create') throw new Error('secret-internal /srv/app/server/app.ts:123'); } },
    });
    const b = await connect(url);
    armed = true;
    const res = await ask(b, 'room:create', { name: 'Ann', vsBot: true });
    expect(res).toEqual({ error: GENERIC_ERROR });
    const text = JSON.stringify(res);
    expect(text).not.toContain('secret-internal');
    expect(text).not.toMatch(LEAKS);
    expect(errorLines(logs)).toHaveLength(1);
    expect(errorLines(logs)[0]).toMatchObject({ level: 'error', where: 'handler:room:create' });
    // the server and the socket survive
    armed = false;
    expect(await rooms(url)).toBe(0);
    expect(isObj(await ask(b, 'room:create', { name: 'Ann', vsBot: true }))).toBe(true);
    expect(await rooms(url)).toBe(1);
  });

  it('c2: a room:join whose code the parser rejects gets the same text as a code that does not exist, not "Bad request."', async () => {
    const { url } = await boot();
    const a = await connect(url);
    const EXPIRED = 'That match link has expired or never existed.';
    const missing = await ask(a, 'room:join', { code: 'ABCDE', name: 'Eve' }); // well formed, no such room
    expect(missing).toEqual({ error: EXPIRED });
    for (const code of ['0O1I', 'abcd1', 'ABCDEFGH', 'ABCDEFGHJ', 'ABCD']) {
      expect(await ask(a, 'room:join', { code, name: 'Eve' }), code).toEqual({ error: EXPIRED });
    }
    // other bad payloads are still BAD_REQUEST
    for (const p of [null, 12345, 'ABCDE', { code: 12345, name: 'x' }, { name: 'x' }]) {
      expect(await ask(a, 'room:join', p), JSON.stringify(p)).toEqual({ error: BAD_REQUEST });
    }
  });

  it('c2 (fuzz): 200 seeded junk payloads per event never throw and never change /health.rooms for an unseated socket', { timeout: 30_000 }, async () => {
    const { url, logs } = await boot();
    const a = await bot(url);
    const b = await connect(url);
    const rnd = mulberry(424242);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const leaf = (): unknown => pick<unknown>([null, 0, -1, 1.5, 2 ** 40, NaN, 'str', 'x'.repeat(1000), [], [[]], {}, [null], [1, 2, 3]]);
    const junk = (): unknown => {
      switch (Math.floor(rnd() * 5)) {
        case 0: return leaf();
        case 1: return pick<unknown>([true, false, undefined, 'COVEN', 'ABCDE']);
        case 2: return { [pick(['type', 'uid', 'code', 'name', 'token', 'vsBot', 'row', 'targets', 'mode'])]: leaf() };
        case 3: return { type: pick<unknown>(['play', 'pass', 5, null]), uid: leaf(), name: leaf(), vsBot: leaf(), code: leaf(), targets: leaf() };
        default: return Array.from({ length: Math.floor(rnd() * 100) }, leaf);
      }
    };
    const withAck = ['room:create', 'room:join', 'lobby:deck', 'game:action'];
    const noAck = ['lobby:house', 'lobby:ready', 'game:forfeit', 'game:rematch', 'room:leave'];
    const before = await rooms(url);
    for (const ev of withAck) {
      for (let i = 0; i < 200; i++) {
        const res = await ask(b, ev, junk());
        expect(isObj(res) && typeof res.error === 'string', `${ev} #${i} got ${JSON.stringify(res)}`).toBe(true);
      }
    }
    for (const ev of noAck) for (let i = 0; i < 200; i++) b.emit(ev, junk());
    await ask(b, 'game:action', null); // barrier
    expect(await rooms(url)).toBe(before);
    expect(b.connected).toBe(true);
    expect(a.s.connected).toBe(true);
    expect(errorLines(logs)).toEqual([]);
    await playOne(a.s, a.game); // the bystander's match is intact
  });
});

// ============================================================================ c3
describe('c3 errors inside the server end that match, not the process', () => {
  /** One error line, /health 200, the room gone. */
  async function expectContained(url: string, logs: LogLine[], where: string, roomsBefore = 1) {
    await sleep(100); // let any stray second line show up
    const lines = errorLines(logs);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'error', where });
    expect(await rooms(url)).toBe(roomsBefore - 1);
  }

  it('c3: an error in the bot timer ends the match with ended "error" and the server keeps serving; a new match starts', async () => {
    let armed = false;
    const { url, logs } = await boot({ hooks: { onTimer: kind => { if (armed && kind === 'bot') throw new Error('bot exploded'); } } });
    const m = await bot(url);
    armed = true;
    const ended = await driveUntilEnded(m.s, m.game);
    expect(ended.ended).toBe('error');
    expect(received<string>(m.s, 'toast')).toContain(ENDED_TOAST);
    await expectContained(url, logs, 'timer:bot');
    armed = false;
    const m2 = await bot(url);
    expect(m2.game.view.over).toBe(false);
    expect(await rooms(url)).toBe(1);
  });

  it('c3: an error in the PvP turn timer ends the match for both seats with ended "error"', async () => {
    let armed = true;
    const { url, logs } = await boot({
      limits: { turnMs: 50 },
      hooks: { onTimer: kind => { if (armed && kind === 'turn') throw new Error('turn exploded'); } },
    });
    const { a, b } = await startPvp(url);
    await expectEndedBy(a, 'error');
    await expectEndedBy(b, 'error');
    await expectContained(url, logs, 'timer:turn');
    armed = false;
    const second = await startPvp(url);
    expect(second.ga.view.over).toBe(false);
  });

  it('c3: an error in the disconnect-grace timer ends the PvP match for the seat that stayed', async () => {
    let armed = true;
    const { url, logs } = await boot({
      limits: { dropGraceMs: 300 },
      hooks: { onTimer: kind => { if (armed && kind === 'drop') throw new Error('drop exploded'); } },
    });
    const { a, b } = await startPvp(url);
    b.close();
    await expectEndedBy(a, 'error');
    await expectContained(url, logs, 'timer:drop');
    armed = false;
    const second = await startPvp(url);
    expect(second.ga.view.over).toBe(false);
  });

  it('c3: after the server ended a PvP match, a later disconnect of the other seat sends the remaining player nothing', async () => {
    let armed = true;
    const dropGraceMs = 300;
    const { url } = await boot({
      limits: { turnMs: 50, dropGraceMs },
      hooks: { onTimer: kind => { if (armed && kind === 'turn') throw new Error('turn exploded'); } },
    });
    const { a, b } = await startPvp(url);
    await expectEndedBy(a, 'error');
    await expectEndedBy(b, 'error');
    armed = false;
    const before = { toast: received<string>(a, 'toast').length, room: received(a, 'room').length, game: received<GameMsg>(a, 'game').length };
    b.close();
    await sleep(dropGraceMs + 300);
    expect(received<string>(a, 'toast').slice(before.toast), 'toasts after the end').toEqual([]);
    expect(received(a, 'room').length, 'room messages after the end').toBe(before.room);
    expect(received<GameMsg>(a, 'game').slice(before.game).map(g => ({ over: g.view.over, winner: g.view.winner })), 'game messages after the end').toEqual([]);
  });

  it('c3: close() with a live PvP match and connected sockets leaves no drop timer armed', async () => {
    const dropGraceMs = 200;
    const timers: string[] = [];
    const b0 = await bootServer({ limits: { dropGraceMs }, hooks: { onTimer: kind => { timers.push(kind); } } });
    const { a, b } = await startPvp(b0.url);
    await b0.srv.close();
    timers.length = 0;
    await sleep(dropGraceMs + 300);
    a.close(); b.close();
    expect(timers).not.toContain('drop');
  });

  it('c3: an error in the bot-idle timer ends the match with ended "error"', async () => {
    let armed = true;
    const { url, logs } = await boot({
      limits: { botIdleMs: 150 },
      hooks: { onTimer: kind => { if (armed && kind === 'idle') throw new Error('idle exploded'); } },
    });
    const m = await bot(url);
    await expectEndedBy(m.s, 'error');
    await expectContained(url, logs, 'timer:idle');
    armed = false;
    const m2 = await bot(url);
    expect(m2.game.view.over).toBe(false);
  });

  it('c3: an error in the sweeper ends the match it was visiting with ended "error"', async () => {
    let armed = false;
    const { url, logs } = await boot({
      limits: { sweepEveryMs: 20 },
      hooks: { onTimer: (kind, code) => { if (armed && kind === 'sweep' && code !== null) throw new Error('sweep exploded'); } },
    });
    const m = await bot(url);
    armed = true;
    await expectEndedBy(m.s, 'error');
    await expectContained(url, logs, 'timer:sweep');
    armed = false;
    const m2 = await bot(url);
    expect(m2.game.view.over).toBe(false);
  });

  it('c3: an error thrown by a handler while the socket is in a playing match ends that match', async () => {
    let armed = false;
    const { url, logs } = await boot({ hooks: { onHandler: ev => { if (armed && ev === 'game:action') throw new Error('handler exploded'); } } });
    const m = await bot(url);
    armed = true;
    expect(await ask(m.s, 'game:action', firstSimplePlay(m.game.view))).toEqual({ error: GENERIC_ERROR });
    await expectEndedBy(m.s, 'error');
    await expectContained(url, logs, 'handler:game:action');
  });

  it('c3: a throw in viewFor after the play was applied, and again while ending the match: GENERIC_ERROR, then ended "error" with the last view, rooms -1', async () => {
    let armed = false;
    const { url, logs } = await boot({ hooks: { onView: () => { if (armed) throw new Error('view exploded'); } } });
    const m = await bot(url);
    const lastSent = received<GameMsg>(m.s, 'game').at(-1);
    if (!lastSent) throw new Error('no game message yet');
    armed = true;
    expect(await ask(m.s, 'game:action', firstSimplePlay(m.game.view))).toEqual({ error: GENERIC_ERROR });
    const ended = await expectEndedBy(m.s, 'error');
    expect(ended.view).toEqual(lastSent.view); // the last good board, not a half-changed one
    expect(errorLines(logs).length).toBeGreaterThanOrEqual(1);
    expect(await rooms(url)).toBe(0);
    armed = false;
    const m2 = await bot(url);
    expect(m2.game.view.over).toBe(false);
  });
});

// ============================================================================ c6
describe('c6 seats', () => {
  const RECONNECT = { limits: { dropGraceMs: 300 } };

  it('c6: with one seat open in two tabs, the older tab is told, its actions get "open in another tab", and its room:leave leaves the newer tab\'s match running', async () => {
    const { url, logs } = await boot();
    const older = await bot(url);
    const newer = await connect(url);
    expect(await ask(newer, 'room:join', { code: older.code, name: 'Ann', token: older.token })).toEqual({ token: older.token });
    const g2 = await next<GameMsg>(newer, 'game');
    expect(g2.view.me).toBe(older.game.view.me);
    expect(await next<string>(older.s, 'toast', t => /another tab/i.test(t))).toBe('This match is now open in another tab.');

    expect(errText(await ask(older.s, 'game:action', firstSimplePlay(older.game.view)))).toMatch(/open in another tab/i);
    older.s.emit('room:leave');
    await ask(older.s, 'game:action', { type: 'pass' }); // barrier: the leave has been handled

    expect(await rooms(url)).toBe(1);
    await playOne(newer, g2);
    await next<GameMsg>(newer, 'game', g => g.events.some(e => e.t === 'play' && e.p === g.view.me));
    expect(received(newer, 'toast')).toEqual([]);
    expect(received<GameMsg>(newer, 'game').some(g => g.view.over)).toBe(false);
    expect(errorLines(logs)).toEqual([]);
  });

  it('c6: creating a room releases the socket from its old match (one live room per socket)', async () => {
    const { url } = await boot();
    const m = await bot(url);
    expect(await rooms(url)).toBe(1);
    const created = await ask(m.s, 'room:create', { name: 'Ann', vsBot: true });
    expect(errText(created)).toBeUndefined();
    expect(await rooms(url)).toBe(1); // not 2
    const other = await connect(url);
    expect(errText(await ask(other, 'room:join', { code: m.code, name: 'Eve' }))).toMatch(/expired|never existed/i);
  });

  it('c6: joining another room releases the socket from its old match (room count falls)', async () => {
    const { url } = await boot();
    const m = await bot(url);
    const host = await connect(url);
    const hosted = await ask(host, 'room:create', { name: 'Hal', vsBot: false });
    if (!isObj(hosted) || typeof hosted.code !== 'string') throw new Error('create failed');
    expect(await rooms(url)).toBe(2);
    const joined = await ask(m.s, 'room:join', { code: hosted.code, name: 'Ann' });
    expect(errText(joined)).toBeUndefined();
    expect(await rooms(url)).toBe(1); // the bot room is gone
    const other = await connect(url);
    expect(errText(await ask(other, 'room:join', { code: m.code, name: 'Eve' }))).toMatch(/expired|never existed/i);
  });

  it('c6 (i): bot match, A plays and disconnects; B joins with A\'s token 50 ms later and, after the grace period, its actions are still accepted', async () => {
    const { url, logs } = await boot(RECONNECT);
    const a = await bot(url);
    await playOne(a.s, a.game);
    await next<GameMsg>(a.s, 'game', g => g.events.some(e => e.t === 'play' && e.p === g.view.me));
    const settled = await untilMyTurn(a.s);
    const before = handSize(settled);
    expect(before).toBeGreaterThan(0);

    a.s.close();
    await sleep(50);
    const b = await connect(url);
    expect(await ask(b, 'room:join', { code: a.code, name: 'Ann', token: a.token })).toEqual({ token: a.token });
    const g = await next<GameMsg>(b, 'game');
    expect(g.view.me).toBe(settled.view.me);
    expect(handSize(g)).toBe(before);

    await sleep(600); // twice the grace period: the old drop timer must not fire against the new socket (a seat that drops twice: see the c6 (iv) test)
    expect(await rooms(url)).toBe(1);
    await playOne(b, g);
    expect(received<GameMsg>(b, 'game').some(m => m.view.over)).toBe(false);
    expect(errorLines(logs)).toEqual([]);
  });

  it('c6 (ii): bot lobby survives a disconnect; B joins with A\'s token 100 ms later, gets the lobby, and /health.rooms is unchanged', async () => {
    const { url } = await boot(RECONNECT);
    const a = await connect(url);
    const created = await ask(a, 'room:create', { name: 'Ann', vsBot: true });
    if (!isObj(created) || typeof created.code !== 'string' || typeof created.token !== 'string') throw new Error('create failed');
    const before = await rooms(url);
    expect(before).toBe(1);

    a.close();
    await sleep(100);
    expect(await rooms(url)).toBe(before);
    const b = await connect(url);
    expect(await ask(b, 'room:join', { code: created.code, name: 'Ann', token: created.token })).toEqual({ token: created.token });
    const snap = await next<RoomSnapshot>(b, 'room', r => r.phase === 'lobby');
    expect(snap.vsBot).toBe(true);
    expect(snap.you).toBe(0);
    expect(snap.code).toBe(created.code);

    await sleep(400); // past the grace period
    expect(await rooms(url)).toBe(before);
    b.emit('lobby:house', 'ORDER'); // still seated and in control
    await next<RoomSnapshot>(b, 'room', r => r.seats[0]?.house === 'ORDER');
  });

  it('c6 (iii): one socket sending room:join twice (a fresh load) gets no toast and stays seated', async () => {
    const { url } = await boot(RECONNECT);
    const a = await bot(url);
    a.s.close();
    await sleep(50);
    const b = await connect(url);
    const payload = { code: a.code, name: 'Ann', token: a.token };
    const acks = await Promise.all([ask(b, 'room:join', payload), ask(b, 'room:join', payload)]);
    expect(acks).toEqual([{ token: a.token }, { token: a.token }]);
    await ask(b, 'lobby:deck', null); // barrier: everything sent before it has been handled and answered
    await sleep(50);
    expect(received(b, 'toast')).toEqual([]);
    const g = received<GameMsg>(b, 'game').at(-1);
    if (!g) throw new Error('no game message after rejoin');
    expect(await rooms(url)).toBe(1);
    await playOne(b, g); // still seated
  });

  it('c6 (iii): the socket that created the match re-joining its own seat twice gets no toast and keeps the match', async () => {
    const { url } = await boot(RECONNECT);
    const a = await bot(url);
    const payload = { code: a.code, name: 'Ann', token: a.token };
    const acks = await Promise.all([ask(a.s, 'room:join', payload), ask(a.s, 'room:join', payload)]);
    expect(acks).toEqual([{ token: a.token }, { token: a.token }]);
    await ask(a.s, 'lobby:deck', null);
    await sleep(50);
    expect(received(a.s, 'toast')).toEqual([]);
    expect(await rooms(url)).toBe(1);
    const g = received<GameMsg>(a.s, 'game').at(-1);
    if (!g) throw new Error('no game message');
    await playOne(a.s, g);
  });
});

describe('c6 seats (a seat that drops twice)', () => {
  it('c6 (iv): a seat drops, rejoins, drops again and rejoins again inside the first grace period; the first drop timer must not forfeit the match', async () => {
    const { url } = await boot({ limits: { dropGraceMs: 300 } });
    const { a, b, code, tokenB } = await startPvp(url);
    expect(tokenB).not.toBe('');
    b.close();                                   // t=0: first drop, timer due at 300
    await sleep(50);
    const b2 = await connect(url);               // t=50: same seat rejoins
    expect(await ask(b2, 'room:join', { code, name: 'Bo', token: tokenB })).toEqual({ token: tokenB });
    await sleep(150);
    b2.close();                                  // t=200: second drop, timer due at 500
    await sleep(150);
    const c = await connect(url);                // t=350: same seat rejoins again
    expect(await ask(c, 'room:join', { code, name: 'Bo', token: tokenB })).toEqual({ token: tokenB });
    const back = await next<GameMsg>(c, 'game');
    expect(back.view.over).toBe(false);
    await sleep(350);                            // t=700: past both timers
    expect(received<GameMsg>(a, 'game').some(g => g.view.over), 'A was told the match is over').toBe(false);
    expect(received<GameMsg>(c, 'game').some(g => g.view.over), 'C was told the match is over').toBe(false);
    expect(await rooms(url)).toBe(1);
  });
});

// ============================================================================ health uptime
describe('/health uptimeS', () => {
  // No injectable clock (ServerOptions has none), so this uses real time. bootedAt is taken inside
  // createGameServer, shortly before boot() resolves. Waiting 700 ms puts the elapsed time at about
  // 700-750 ms: past 500 ms, where Math.round wrongly gives 1, and 250 ms short of 1000 ms, where even
  // Math.floor would give 1, so scheduling jitter can't flip the result.
  it('uptimeS never exceeds the real uptime: 700 ms after boot it is the integer 0, not 1', async () => {
    const { url } = await boot();
    await sleep(700);
    const { uptimeS } = await healthJson(url);
    expect(Number.isInteger(uptimeS)).toBe(true);
    expect(uptimeS).toBe(0);
  });
});

// ============================================================================ c7
describe('c7 no clock against the bot', () => {
  it('c7: DEFAULT_LIMITS durations are pinned (60 s turn and grace, 15 min bot idle, 2 min lobby, 30 min room, 30 s sweep)', () => {
    expect(TURN_SECONDS).toBe(60);
    expect(DEFAULT_LIMITS).toMatchObject({
      turnMs: 60_000, dropGraceMs: 60_000, botIdleMs: 900_000, lobbyIdleMs: 120_000, roomIdleMs: 1_800_000, sweepEveryMs: 30_000,
    });
  });

  it('c7: vs bot with turnMs 50, every deadline is null and it is still the human\'s turn after 300 ms', async () => {
    const { url } = await boot({ limits: { turnMs: 50 } });
    const m = await bot(url);
    await sleep(300);
    const games = received<GameMsg>(m.s, 'game');
    expect(games.length).toBeGreaterThan(0);
    expect(games.every(g => g.deadline === null)).toBe(true);
    const last = games[games.length - 1];
    expect(isMyTurn(last)).toBe(true);
    expect(games.flatMap(g => g.events).some(e => e.t === 'pass' && e.p === m.game.view.me)).toBe(false);
    expect(received<string>(m.s, 'toast').filter(t => /Time ran out/.test(t))).toEqual([]);
    await playOne(m.s, last);
  });

  it('c7: a bot match with no human action ends with ended "idle" after botIdleMs 150, and its room is freed', async () => {
    const { url, logs } = await boot({ limits: { botIdleMs: 150 } });
    const m = await bot(url);
    expect(await rooms(url)).toBe(1);
    await expectEndedBy(m.s, 'idle');
    expect(await rooms(url)).toBe(0);
    expect(errorLines(logs)).toEqual([]);
  });

  it('c7: a human action re-arms the idle clock (botIdleMs 600: act at 400 ms, still alive at 800 ms, ended by ~1000 ms)', async () => {
    const { url } = await boot({ limits: { botIdleMs: 600 } });
    const m = await bot(url);
    await sleep(400);
    expect(received<GameMsg>(m.s, 'game').some(g => g.ended)).toBe(false);
    await playOne(m.s, m.game);
    await sleep(400);
    expect(received<GameMsg>(m.s, 'game').some(g => g.ended)).toBe(false);
    expect(await rooms(url)).toBe(1);
    await expectEndedBy(m.s, 'idle');
    expect(await rooms(url)).toBe(0);
  });

  it('c7: PvP keeps the clock: a deadline is sent and, with turnMs 50, the player on turn is auto-passed', async () => {
    const { url } = await boot({ limits: { turnMs: 50 } });
    const { a, b, ga } = await startPvp(url);
    expect(typeof ga.deadline).toBe('number');
    await next<GameMsg>(a, 'game', g => g.events.some(e => e.t === 'pass'), 3000);
    await Promise.any([
      next<string>(a, 'toast', t => /Time ran out/.test(t), 3000),
      next<string>(b, 'toast', t => /Time ran out/.test(t), 3000),
    ]);
  });
});

// ============================================================================ c8
describe('c8 starter decks only against the bot', () => {
  /** A legal COVEN deck with as many non-starter cards as the first 60 seeds give. */
  function customDeck(house: House): string[] {
    const starter = new Set(STARTERS[house]);
    let best: string[] = [];
    let bestN = -1;
    for (let seed = 1; seed <= 60; seed++) {
      const d = randomDeck(house, mulberry(seed));
      const n = d.filter(id => !starter.has(id)).length;
      if (n > bestN) { best = d; bestN = n; }
    }
    expect(validateDeck(house, best)).toBeNull();
    expect(bestN, 'the custom deck must differ visibly from the starter').toBeGreaterThanOrEqual(8);
    return best;
  }

  it('c8: in a bot room, lobby:deck with a legal custom deck gets an ack error, and the match is dealt from the starter deck', async () => {
    const { url } = await boot();
    const s = await connect(url);
    const created = await ask(s, 'room:create', { name: 'Ann', vsBot: true });
    expect(errText(created)).toBeUndefined();
    s.emit('lobby:house', 'COVEN');
    const res = await ask(s, 'lobby:deck', customDeck('COVEN'));
    expect(errText(res)).toBe('Matches against the bot use the starter deck.');
    s.emit('lobby:ready', true);
    const g = await next<GameMsg>(s, 'game', () => true, 3000);
    const starter = new Set(STARTERS.COVEN);
    const hand = g.view.players[g.view.me].hand ?? [];
    expect(hand.length).toBeGreaterThan(0);
    for (const c of hand) expect(starter.has(c.cardId), `${c.cardId} is not in the COVEN starter deck`).toBe(true);
    const snap = received<RoomSnapshot>(s, 'room').at(-1);
    expect(snap?.seats[0]?.customDeck).toBe(false);
  });

  it('c8: a PvP lobby still accepts a legal custom deck', async () => {
    const { url } = await boot();
    const s = await connect(url);
    expect(errText(await ask(s, 'room:create', { name: 'Ann', vsBot: false }))).toBeUndefined();
    s.emit('lobby:house', 'COVEN');
    expect(await ask(s, 'lobby:deck', customDeck('COVEN'))).toEqual({ ok: true });
    await next<RoomSnapshot>(s, 'room', r => r.seats[0]?.customDeck === true);
  });
});
