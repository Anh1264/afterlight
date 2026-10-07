import { afterEach, describe, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { ALL_HOUSES } from '../shared/cards';
import type { GameMsg } from '../shared/protocol';
import { consoleSink } from './log';
import {
  as2b, ask, bootServer, client, createRoom, firstSimplePlay, health, next, passUntilEnd, pvpMatch, sleep, startBotMatch, until,
  type Booted, type LogLine,
} from './testkit';

// PR 2b, criterion c9 (DM-6): one single-line JSON log per funnel event, and /health.
// Spec: docs/specs/demo-mvp.md, PR 2 c9, and the design's "Funnel log" and "/health" tables.

const booted: Booted[] = [];
const socks: Socket[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const s of socks.splice(0)) s.close();
  await Promise.all(booted.splice(0).map(b => b.srv.close()));
});

const boot = async (o: object = {}) => { const b = await bootServer(as2b({ trustProxy: 'x-real-ip', ...o })); booted.push(b); return b; };
const connect = async (url: string, ip?: string, device?: 'phone' | 'tablet' | 'desktop') => {
  const s = client(url, { ip, device }); socks.push(s); await next(s, 'connect'); return s;
};
const bot = async (url: string, ip?: string) => { const m = await startBotMatch(url, ip); socks.push(m.s); return m; };
const pvp = async (url: string, o: Parameters<typeof pvpMatch>[1] = {}) => { const m = await pvpMatch(url, o); socks.push(m.a, m.b); return m; };

const HEX8 = /^[0-9a-f]{8}$/;
const of = (logs: LogLine[], message: string) => logs.filter(l => l.message === message);
const ENDS = ['normal', 'forfeit', 'leave', 'disconnect', 'error', 'idle'];

describe('c9 funnel lines', () => {
  it('c9: each line is one single-line JSON string on stdout with level, message and ts (consoleSink)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { url } = await boot({ log: consoleSink });
    const s = await connect(url, '10.3.0.1');
    await createRoom(s, true);
    const parsed = spy.mock.calls.map(c => {
      expect(typeof c[0]).toBe('string');
      expect(String(c[0])).not.toContain('\n');
      return JSON.parse(String(c[0])) as LogLine;
    });
    for (const l of parsed) expect(l).toMatchObject({ level: expect.any(String), message: expect.any(String), ts: expect.anything() });
    expect(parsed.map(l => l.message)).toEqual(expect.arrayContaining(['connect', 'room_create']));
  });

  it('c9: connect writes exactly one line with the device: "unknown" without auth', async () => {
    const { url, logs } = await boot();
    await connect(url, '10.3.1.1');
    const lines = of(logs, 'connect');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'info', device: 'unknown' });
    expect(lines[0].cid).toMatch(HEX8);
  });

  it.each([['phone'], ['tablet'], ['desktop']] as const)('c9: connect with auth device %s logs that class', async device => {
    const { url, logs } = await boot();
    await connect(url, '10.3.1.2', device);
    expect(of(logs, 'connect')).toHaveLength(1);
    expect(of(logs, 'connect')[0]).toMatchObject({ device });
  });

  it('c9: connect with an unexpected device value logs "unknown"', async () => {
    const { url, logs } = await boot();
    const odd = io(url, { forceNew: true, transports: ['websocket'], reconnection: false, auth: { device: 'toaster' } });
    socks.push(odd);
    await new Promise<void>(r => odd.on('connect', () => r()));
    expect(of(logs, 'connect')).toHaveLength(1);
    expect(of(logs, 'connect')[0]).toMatchObject({ device: 'unknown' });
  });

  it('c9: room_create writes exactly one line per create with rid, the creator\'s cid and vsBot', async () => {
    const { url, logs } = await boot();
    const s = await connect(url, '10.3.2.1');
    await createRoom(s, true);
    await createRoom(s, false);
    const lines = of(logs, 'room_create');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ level: 'info', vsBot: true });
    expect(lines[1]).toMatchObject({ level: 'info', vsBot: false });
    expect(lines[0].rid).toMatch(HEX8);
    expect(lines[1].rid).toMatch(HEX8);
    expect(lines[0].rid).not.toBe(lines[1].rid);
    expect(lines[0].cid).toBe(of(logs, 'connect')[0].cid);
  });

  it('c9: a refused create (bad payload) writes no room_create line; the next good one writes exactly one', async () => {
    const { url, logs } = await boot();
    const s = await connect(url, '10.3.2.2');
    await ask(s, 'room:create', null);
    expect(of(logs, 'room_create')).toHaveLength(0);
    await createRoom(s, true);
    expect(of(logs, 'room_create')).toHaveLength(1);
  });

  it('c9: match_start (vs bot) writes exactly one line: match number 1, both houses, who went first, the bot seat', async () => {
    const { url, logs } = await boot();
    const m = await bot(url, '10.3.3.1');
    const lines = of(logs, 'match_start');
    expect(lines).toHaveLength(1);
    const l = lines[0];
    expect(l).toMatchObject({ level: 'info', n: 1, vsBot: true, botSeat: 1 });
    expect(l.rid).toBe(of(logs, 'room_create')[0].rid);
    const houses = l.houses as string[];
    expect(houses).toHaveLength(2);
    expect(houses[0]).toBe('COVEN');
    expect(ALL_HOUSES).toContain(houses[1]);
    expect(houses[1]).not.toBe('COVEN');
    expect(l.first).toBe(m.game.view.first);
    expect([0, 1]).toContain(l.first);
  });

  it('c9: match_start (PvP) has botSeat null, houses by seat, and the same "first" the players saw', async () => {
    const { url, logs } = await boot();
    const m = await pvp(url);
    const lines = of(logs, 'match_start');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ n: 1, vsBot: false, botSeat: null, houses: ['COVEN', 'ORDER'], first: m.ga.view.first });
  });

  it('c9: match_end "normal": reason, winner, round scores, duration, the human\'s plays (0: they only passed), written once', async () => {
    const { url, logs } = await boot();
    const m = await bot(url, '10.3.4.1');
    await sleep(120);
    const last = await passUntilEnd(m.s, m.game);
    expect(last.view.over).toBe(true);
    const lines = of(logs, 'match_end');
    expect(lines).toHaveLength(1);
    const l = lines[0];
    expect(l).toMatchObject({ level: 'info', n: 1, vsBot: true, botSeat: 1, reason: 'normal', winner: last.view.winner });
    expect(l.rid).toBe(of(logs, 'match_start')[0].rid);
    expect(l.rounds).toEqual(last.view.results.map(r => r.scores));
    expect((l.rounds as unknown[]).length).toBeGreaterThanOrEqual(2);
    expect(l.ms).toBeGreaterThanOrEqual(100);
    expect((l.plays as number[])[0]).toBe(0);
    expect(Number.isInteger((l.plays as number[])[1])).toBe(true);
    m.s.close();
    await sleep(150);
    expect(of(logs, 'match_end')).toHaveLength(1); // leaving a finished match writes nothing more
  });

  it('c9: match_end "forfeit" counts the human\'s accepted card plays, and the opponent wins', async () => {
    const { url, logs } = await boot();
    const m = await bot(url, '10.3.4.2');
    expect(await ask(m.s, 'game:action', firstSimplePlay(m.game.view))).toEqual({ ok: true });
    await next<GameMsg>(m.s, 'game', g => g.events.some(e => e.t === 'play' && e.p === g.view.me));
    await ask(m.s, 'game:action', { type: 'launch' }); // a refused action is not a play
    m.s.emit('game:forfeit');
    await next<GameMsg>(m.s, 'game', g => g.view.over);
    const lines = of(logs, 'match_end');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ reason: 'forfeit', winner: 1, vsBot: true, botSeat: 1, n: 1 });
    expect((lines[0].plays as number[])[0]).toBe(1);
  });

  it('c9: match_end "leave" when the human leaves a bot match', async () => {
    const { url, logs } = await boot();
    const m = await bot(url, '10.3.4.3');
    m.s.emit('room:leave');
    await until('match_end lines', () => of(logs, 'match_end').length, 1);
    expect(of(logs, 'match_end')[0]).toMatchObject({ reason: 'leave', winner: 1 });
    await sleep(100);
    expect(of(logs, 'match_end')).toHaveLength(1);
  });

  it('c9: match_end "disconnect" when a PvP seat does not come back within the grace period; the seat that stayed wins', async () => {
    const { url, logs } = await boot({ limits: { dropGraceMs: 150 } });
    const m = await pvp(url);
    m.b.close();
    await until('match_end lines', () => of(logs, 'match_end').length, 1);
    expect(of(logs, 'match_end')[0]).toMatchObject({ reason: 'disconnect', winner: 0, vsBot: false, botSeat: null });
    await sleep(150);
    expect(of(logs, 'match_end')).toHaveLength(1);
  });

  it('c9: match_end "error" (winner null) and exactly one error line, with the same rid', async () => {
    let armed = false;
    const { url, logs } = await boot({ hooks: { onTimer: (k: string) => { if (armed && k === 'bot') throw new Error('bot exploded'); } } });
    const m = await bot(url, '10.3.4.4');
    armed = true;
    await ask(m.s, 'game:action', firstSimplePlay(m.game.view));
    await next<GameMsg>(m.s, 'game', g => g.ended === 'error', 3000);
    await sleep(100);
    const ends = of(logs, 'match_end');
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ reason: 'error', winner: null });
    const errs = of(logs, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ level: 'error', where: 'timer:bot', rid: ends[0].rid, err: 'bot exploded' });
    expect(errs[0].stack).toEqual(expect.any(String));
  });

  it('c9: match_end "idle" (winner null) after botIdleMs with no human action', async () => {
    const { url, logs } = await boot({ limits: { botIdleMs: 150 } });
    await bot(url, '10.3.4.5');
    await until('match_end lines', () => of(logs, 'match_end').length, 1);
    expect(of(logs, 'match_end')[0]).toMatchObject({ reason: 'idle', winner: null });
  });

  it('c9: every match_end reason is one of the six', async () => {
    const { url, logs } = await boot();
    const m = await bot(url, '10.3.4.6');
    m.s.emit('game:forfeit');
    await until('match_end lines', () => of(logs, 'match_end').length, 1);
    expect(ENDS).toContain(of(logs, 'match_end')[0].reason);
  });

  it('c9: rematch writes one line only when both seats have accepted, with the new match number; the next match_start has n 2', async () => {
    const { url, logs } = await boot();
    const m = await pvp(url);
    m.a.emit('game:forfeit');
    await next<GameMsg>(m.b, 'game', g => g.view.over);
    m.a.emit('game:rematch');
    await ask(m.a, 'game:action', { type: 'pass' }); // barrier: the same socket's events are handled in order
    expect(of(logs, 'rematch')).toHaveLength(0);
    m.b.emit('game:rematch');
    await until('rematch lines', () => of(logs, 'rematch').length, 1);
    expect(of(logs, 'rematch')[0]).toMatchObject({ level: 'info', n: 2, rid: of(logs, 'room_create')[0].rid });
    m.a.emit('lobby:ready', true); m.b.emit('lobby:ready', true);
    await until('match_start lines', () => of(logs, 'match_start').length, 2);
    expect(of(logs, 'match_start')[1]).toMatchObject({ n: 2 });
    await sleep(100);
    expect(of(logs, 'rematch')).toHaveLength(1);
  });

  it('c9: rematch against the bot (the bot accepts at once) writes one line', async () => {
    const { url, logs } = await boot();
    const m = await bot(url, '10.3.5.1');
    m.s.emit('game:forfeit');
    await next<GameMsg>(m.s, 'game', g => g.view.over);
    m.s.emit('game:rematch');
    await until('rematch lines', () => of(logs, 'rematch').length, 1);
    expect(of(logs, 'rematch')[0]).toMatchObject({ n: 2 });
  });

  it('c9: an error line carries where, the room\'s rid, err and stack', async () => {
    const { url, logs } = await boot({ hooks: { onHandler: (ev: string) => { if (ev === 'lobby:house') throw new Error('handler exploded'); } } });
    const s = await connect(url, '10.3.6.1');
    await createRoom(s, true);
    await ask(s, 'lobby:house', 'COVEN');
    const errs = of(logs, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ level: 'error', where: 'handler:lobby:house', err: 'handler exploded' });
    expect(errs[0].rid).toBe(of(logs, 'room_create')[0].rid);
  });

  it('c9: bad_request is a warn line with event and field and never the value; repeats of one event+field in a minute write one line', async () => {
    const { url, logs } = await boot();
    const s = await connect(url, '10.3.7.1');
    for (let i = 0; i < 5; i++) await ask(s, 'game:action', 'SECRET-VALUE-ONE');
    await ask(s, 'room:create', { name: 12345, vsBot: true });
    await ask(s, 'room:join', { code: 'ABCDE', name: 'x', token: 'SECRET-TOKEN-VALUE' });
    const lines = of(logs, 'bad_request');
    expect(lines.map(l => `${l.event}/${l.field}`).sort()).toEqual(['game:action/payload', 'room:create/name', 'room:join/token']);
    for (const l of lines) expect(l.level).toBe('warn');
    const all = JSON.stringify(lines);
    for (const secret of ['SECRET-VALUE-ONE', 'SECRET-TOKEN-VALUE', '12345']) expect(all).not.toContain(secret);
    expect((await health(url)).counts).toMatchObject({ rejected: 7 }); // every refusal counts, even when its line is deduplicated
  });
});

describe('c9 privacy: no token, IP, player name or room code in any line', () => {
  it('c9: a full session (connect, create, join, play, forfeit, rematch, junk, an error) leaves none of the identifying values in the log', async () => {
    let armed = false;
    const { url, logs } = await boot({ hooks: { onHandler: (ev: string) => { if (armed && ev === 'lobby:house') throw new Error('handler exploded'); } } });
    const ipA = '10.77.66.55', ipB = '10.88.99.11';
    const m = await pvp(url, { nameA: 'Zorbulax', nameB: 'Quillfeather', ipA, ipB });
    await ask(m.a, 'room:join', { code: m.code, name: 'Zorbulax', token: 'f'.repeat(31) + 'g' }); // junk with the real code in it
    m.a.emit('game:forfeit');
    await next<GameMsg>(m.b, 'game', g => g.view.over);
    m.a.emit('game:rematch'); m.b.emit('game:rematch');
    await until('rematch lines', () => of(logs, 'rematch').length, 1);
    armed = true;
    await ask(m.a, 'lobby:house', 'COVEN'); // throws: the one error line
    armed = false; // the bot match below sends lobby:house too
    const bm = await bot(url, '10.55.44.33');
    const botRoom = await createRoom(bm.s, true, 'Zorbulax'); // releases the bot match: 'leave'

    for (const msg of ['connect', 'room_create', 'match_start', 'match_end', 'rematch', 'error']) {
      expect(of(logs, msg).length, `a "${msg}" line exists`).toBeGreaterThanOrEqual(1);
    }
    const text = JSON.stringify(logs);
    const secrets: [string, string][] = [
      ['player name', 'Zorbulax'], ['player name', 'Quillfeather'],
      ['room code', m.code], ['room code', botRoom.code], ['room code', bm.code],
      ['token', m.tokenA], ['token', m.tokenB], ['token', bm.token], ['token', botRoom.token],
      ['ip', ipA], ['ip', ipB], ['ip', '10.55.44.33'], ['ip', '127.0.0.1'], ['ip', '::1'],
    ];
    for (const [what, value] of secrets) expect(text.includes(value), `${what} ${value} must not appear in any log line`).toBe(false);
  });
});

describe('c9 /health', () => {
  const COUNT_KEYS = ['connects', 'errors', 'limited', 'matchesEndedNormal', 'matchesStarted', 'rejected', 'roomsCreated'];

  it('c9: /health returns exactly ok, sha, uptimeS, rooms, sockets, memMB and counts (no codes, tokens, names)', async () => {
    const { url } = await boot({ buildSha: 'abc1234def' });
    const a = await connect(url, '10.4.0.1');
    await connect(url, '10.4.0.2');
    const r = await createRoom(a, false, 'Zorbulax');
    const j = await health(url);
    expect(Object.keys(j).sort()).toEqual(['counts', 'memMB', 'ok', 'rooms', 'sha', 'sockets', 'uptimeS']);
    expect(j).toMatchObject({ ok: true, sha: 'abc1234def', rooms: 1, sockets: 2 });
    expect(Number.isInteger(j.uptimeS)).toBe(true);
    expect(j.uptimeS as number).toBeGreaterThanOrEqual(0);
    const mem = j.memMB as Record<string, number>;
    expect(Object.keys(mem).sort()).toEqual(['heapUsed', 'rss']);
    expect(mem.rss).toBeGreaterThan(0);
    expect(mem.heapUsed).toBeGreaterThan(0);
    expect(Object.keys(j.counts as object).sort()).toEqual(COUNT_KEYS);
    const text = JSON.stringify(j);
    for (const v of [r.code, r.token, 'Zorbulax', '10.4.0.1', '127.0.0.1']) expect(text).not.toContain(v);
  });

  it('c9: sha defaults to "dev"', async () => {
    const { url } = await boot();
    expect((await health(url)).sha).toBe('dev');
  });

  it('c9: since-boot counts: connects, roomsCreated, matchesStarted, rejected', async () => {
    const { url } = await boot();
    const a = await connect(url, '10.4.1.1');
    const b = await connect(url, '10.4.1.2');
    expect((await health(url)).counts).toEqual({ connects: 2, roomsCreated: 0, matchesStarted: 0, matchesEndedNormal: 0, errors: 0, rejected: 0, limited: 0 });
    const m = await bot(url, '10.4.1.3');
    await createRoom(b, false);
    await ask(a, 'game:action', 'junk');
    expect((await health(url)).counts).toEqual({ connects: 3, roomsCreated: 2, matchesStarted: 1, matchesEndedNormal: 0, errors: 0, rejected: 1, limited: 0 });
    m.s.emit('game:forfeit');
    await next<GameMsg>(m.s, 'game', g => g.view.over);
    expect((await health(url)).counts).toMatchObject({ matchesStarted: 1, matchesEndedNormal: 0 }); // a forfeit is not a normal end
  });

  it('c9: matchesEndedNormal counts a match played to its end', async () => {
    const { url } = await boot();
    const m = await bot(url, '10.4.2.1');
    await passUntilEnd(m.s, m.game);
    expect((await health(url)).counts).toMatchObject({ matchesStarted: 1, matchesEndedNormal: 1 });
  });

  it('c9: errors counts error lines; limited counts refused creates', async () => {
    const { url, logs } = await boot({
      limits: { createsPerSocketPerMin: 1 },
      hooks: { onHandler: (ev: string) => { if (ev === 'lobby:house') throw new Error('handler exploded'); } },
    });
    const s = await connect(url, '10.4.3.1');
    await createRoom(s, true);
    expect(await ask(s, 'lobby:house', 'COVEN')).toEqual({ error: 'Something went wrong. Please try again.' });
    expect(await ask(s, 'room:create', { name: 'Ann', vsBot: true })).toEqual({ error: 'Too many new matches, try again in a minute.' });
    expect(of(logs, 'error')).toHaveLength(1);
    expect((await health(url)).counts).toMatchObject({ errors: 1, limited: 1, rejected: 0 });
  });

  it('c9: sockets falls when a socket closes', async () => {
    const { url } = await boot();
    const a = await connect(url, '10.4.4.1');
    await connect(url, '10.4.4.2');
    expect((await health(url)).sockets).toBe(2);
    a.close();
    await until('sockets', async () => (await health(url)).sockets, 1);
  });
});
