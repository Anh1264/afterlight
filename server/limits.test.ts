import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingHttpHeaders } from 'node:http';
import type { Socket } from 'socket.io-client';
import type { GameMsg } from '../shared/protocol';
import { DEFAULT_LIMITS, FixedWindow, clientIp, ipKey } from './limits';
import {
  as2b, ask, bootServer, client, createRoom, firstSimplePlay, health, next, roomCount, sleep, startBotMatch, until, type Booted,
} from './testkit';

// PR 2b, criterion c5: room cap and sweeping, plus the pure helpers 2b adds to server/limits.ts.
// Spec: docs/specs/demo-mvp.md, PR 2 c5, "server/limits.ts" and "Abuse limits (2b)" in the design; ruling (b) wires lobbyIdleMs.

const FULL = 'AFTERLIGHT is full right now. Try again in a few minutes.';

const booted: Booted[] = [];
const socks: Socket[] = [];

afterEach(async () => {
  for (const s of socks.splice(0)) s.close();
  await Promise.all(booted.splice(0).map(b => b.srv.close()));
});

const boot = async (o: object = {}) => { const b = await bootServer(as2b({ trustProxy: 'x-real-ip', ...o })); booted.push(b); return b; };
const connect = async (url: string, ip?: string) => { const s = client(url, { ip }); socks.push(s); await next(s, 'connect'); return s; };
const isErr = (r: unknown) => typeof r === 'object' && r !== null && 'error' in r;

describe('c5 room cap', () => {
  it('c5: at the global cap room:create answers exactly "AFTERLIGHT is full right now. Try again in a few minutes." and existing matches keep running', async () => {
    const { url } = await boot({ limits: { maxRooms: 3 } });
    const match = await startBotMatch(url, '10.2.0.1');
    socks.push(match.s);
    const hostA = await connect(url, '10.2.0.2');
    const lobbyA = await createRoom(hostA, false);
    const hostB = await connect(url, '10.2.0.3');
    await createRoom(hostB, true);
    expect(await roomCount(url)).toBe(3);

    const late = await connect(url, '10.2.0.4');
    expect(await ask(late, 'room:create', { name: 'Eve', vsBot: true })).toEqual({ error: FULL });
    expect(await ask(late, 'room:create', { name: 'Eve', vsBot: false })).toEqual({ error: FULL });
    expect(await roomCount(url)).toBe(3);

    // the running match is untouched
    expect(await ask(match.s, 'game:action', firstSimplePlay(match.game.view))).toEqual({ ok: true });
    await next<GameMsg>(match.s, 'game', g => g.events.some(e => e.t === 'play' && e.p === g.view.me));
    // joining an existing lobby needs no new room
    const guest = await connect(url, '10.2.0.5');
    expect(isErr(await ask(guest, 'room:join', { code: lobbyA.code, name: 'Gus' }))).toBe(false);
    expect(await roomCount(url)).toBe(3);

    // freeing a room frees the slot: a bot lobby is deleted when its owner leaves
    hostB.emit('room:leave');
    await until('rooms', () => roomCount(url), 2);
    expect(isErr(await ask(late, 'room:create', { name: 'Eve', vsBot: true }))).toBe(false);
  });

  it('c5: at maxSockets the next connection is refused with "AFTERLIGHT is full right now. Try again in a few minutes." (connect_error)', async () => {
    const { url } = await boot({ limits: { maxSockets: 2 } });
    await connect(url, '10.2.1.1');
    await connect(url, '10.2.1.2');
    const third = client(url, { ip: '10.2.1.3' });
    socks.push(third);
    expect(await next<string>(third, 'connect_error')).toBe(FULL);
  });
});

describe('c5 sweeping empty lobbies (ruling b: lobbyIdleMs)', { timeout: 20_000 }, () => {
  const SWEEP = { sweepEveryMs: 20 };

  it.each([[false], [true]])('c5: a never-started lobby (vsBot %s) with no connected socket is swept after lobbyIdleMs, not after 10 minutes', async vsBot => {
    const { url } = await boot({ limits: { ...SWEEP, lobbyIdleMs: 1500 } });
    const s = await connect(url, '10.2.2.1');
    await createRoom(s, vsBot);
    expect(await roomCount(url)).toBe(1);
    s.close();
    await sleep(600);
    expect(await roomCount(url)).toBe(1); // not before lobbyIdleMs
    await until('rooms', () => roomCount(url), 0, 8000);
  });

  it('c5: a finished match (phase over) with no connected human is swept after lobbyIdleMs', async () => {
    const { url } = await boot({ limits: { ...SWEEP, lobbyIdleMs: 1500 } });
    const m = await startBotMatch(url, '10.2.3.1');
    socks.push(m.s);
    m.s.emit('game:forfeit');
    await next<GameMsg>(m.s, 'game', g => g.view.over);
    expect(await roomCount(url)).toBe(1);
    m.s.close();
    await until('rooms', () => roomCount(url), 0, 8000);
  });

  it('c5: the idle clock starts when the last human leaves, not when the room was created', async () => {
    const { url } = await boot({ limits: { ...SWEEP, lobbyIdleMs: 1500 } });
    const s = await connect(url, '10.2.4.1');
    await createRoom(s, false);
    await sleep(1800); // longer than lobbyIdleMs, but the owner is connected the whole time
    expect(await roomCount(url)).toBe(1);
    s.close();
    await sleep(600);
    expect(await roomCount(url)).toBe(1);
    await until('rooms', () => roomCount(url), 0, 8000);
  });

  it('c5: a lobby with a connected socket is never swept, however short lobbyIdleMs is', async () => {
    const { url } = await boot({ limits: { ...SWEEP, lobbyIdleMs: 100 } });
    const s = await connect(url, '10.2.5.1');
    await createRoom(s, false);
    await sleep(600);
    expect(await roomCount(url)).toBe(1);
  });

  it('c5: a seat that comes back before lobbyIdleMs keeps its lobby', async () => {
    const { url } = await boot({ limits: { ...SWEEP, lobbyIdleMs: 1500 } });
    const first = await connect(url, '10.2.6.1');
    const { code, token } = await createRoom(first, false);
    first.close();
    await sleep(120);
    const back = await connect(url, '10.2.6.1');
    expect(await ask(back, 'room:join', { code, name: 'Ann', token })).toEqual({ token });
    await sleep(2000); // longer than lobbyIdleMs: the returned seat keeps the lobby
    expect(await roomCount(url)).toBe(1);
  });

  it('c5: a lobby swept for being empty is gone for a late joiner ("expired or never existed")', async () => {
    const { url } = await boot({ limits: { ...SWEEP, lobbyIdleMs: 1500 } });
    const s = await connect(url, '10.2.7.1');
    const { code } = await createRoom(s, false);
    s.close();
    await until('rooms', () => roomCount(url), 0, 8000);
    const late = await connect(url, '10.2.7.2');
    expect(await ask(late, 'room:join', { code, name: 'Eve' })).toEqual({ error: 'That match link has expired or never existed.' });
  });

  it('c5: the sweep never deletes a live match: phase "playing" with no human connected, however old emptySince is', async () => {
    const { url } = await boot({ limits: { ...SWEEP, lobbyIdleMs: 100, dropGraceMs: 60_000 } });
    const m = await startBotMatch(url, '10.2.8.1');
    socks.push(m.s);
    m.s.close(); // the human drops: the grace period (60 s) keeps the match, the sweep must too
    await sleep(900);
    expect(await roomCount(url)).toBe(1);
  });

  it('c5: a match forfeited after its grace period with no human connected is swept lobbyIdleMs after the forfeit, not after the disconnect', async () => {
    // disconnect at t0; forfeit at t0+1000; swept at t0+3000 (forfeit + 2000). Without the forfeit resetting the clock: t0+2000.
    const { url } = await boot({ limits: { ...SWEEP, lobbyIdleMs: 2000, dropGraceMs: 1000 } });
    const m = await startBotMatch(url, '10.2.9.1');
    socks.push(m.s);
    const t0 = Date.now();
    m.s.close();
    await sleep(Math.max(0, t0 + 2600 - Date.now()));
    expect(await roomCount(url)).toBe(1);
    await until('rooms', () => roomCount(url), 0, 6000);
  });

  it('c4: the sweep prunes the create windows (FixedWindow.prune runs on every sweep, once per window: socket, IP, bad_request)', async () => {
    const prune = vi.spyOn(FixedWindow.prototype, 'prune');
    try {
      await boot({ limits: { sweepEveryMs: 20 } });
      await sleep(300);
      expect(prune.mock.calls.length).toBeGreaterThanOrEqual(3 * 3);
    } finally {
      prune.mockRestore();
    }
  });
});

describe('c9 counts.limited counts every refusal', () => {
  const limited = async (url: string) => ((await health(url)).counts as Record<string, number>).limited;

  it('c9: a per-IP socket cap refusal counts as limited', async () => {
    const { url } = await boot({ limits: { maxSocketsPerIp: 1 } });
    await connect(url, '10.2.10.1');
    const refused = client(url, { ip: '10.2.10.1' });
    socks.push(refused);
    await next(refused, 'connect_error');
    expect(await limited(url)).toBe(1);
  });

  it('c9: a global socket cap refusal counts as limited', async () => {
    const { url } = await boot({ limits: { maxSockets: 1 } });
    await connect(url, '10.2.11.1');
    const refused = client(url, { ip: '10.2.11.2' });
    socks.push(refused);
    expect(await next<string>(refused, 'connect_error')).toBe(FULL);
    expect(await limited(url)).toBe(1);
  });

  it('c9: a room cap refusal counts as limited', async () => {
    const { url } = await boot({ limits: { maxRooms: 1 } });
    const a = await connect(url, '10.2.12.1');
    await createRoom(a, false);
    const b = await connect(url, '10.2.12.2');
    expect(await ask(b, 'room:create', { name: 'Bo', vsBot: false })).toEqual({ error: FULL });
    expect(await limited(url)).toBe(1);
  });
});

describe('server/limits.ts defaults and pure helpers (2b)', () => {
  it('c5/c4: DEFAULT_LIMITS abuse numbers are pinned (10,000 rooms, 2,000 sockets, 40 per IP, 10 creates/min per socket, 60 per IP)', () => {
    expect(DEFAULT_LIMITS).toMatchObject({
      maxRooms: 10_000, maxSockets: 2_000, maxSocketsPerIp: 40, createsPerSocketPerMin: 10, createsPerIpPerMin: 60,
      lobbyIdleMs: 120_000,
    });
  });

  describe('clientIp(headers, remoteAddress, trust)', () => {
    const h = (v?: string | string[]): IncomingHttpHeaders => (v === undefined ? {} : { 'x-real-ip': v });
    it('trust "x-real-ip" uses a valid X-Real-IP', () => {
      expect(clientIp(h('203.0.113.7'), '10.0.0.1', 'x-real-ip')).toBe('203.0.113.7');
      expect(clientIp(h('2001:db8::1'), '10.0.0.1', 'x-real-ip')).toBe('2001:db8::1');
    });
    it('trust "none" ignores the header', () => {
      expect(clientIp(h('203.0.113.7'), '10.0.0.1', 'none')).toBe('10.0.0.1');
    });
    it('a missing, malformed or duplicated ("a, b") header falls back to the remote address', () => {
      expect(clientIp(h(), '10.0.0.1', 'x-real-ip')).toBe('10.0.0.1');
      expect(clientIp(h('not an ip'), '10.0.0.1', 'x-real-ip')).toBe('10.0.0.1');
      expect(clientIp(h('1.1.1.1, 2.2.2.2'), '10.0.0.1', 'x-real-ip')).toBe('10.0.0.1');
      expect(clientIp(h(''), '10.0.0.1', 'x-real-ip')).toBe('10.0.0.1');
    });
  });

  describe('ipKey(ip)', () => {
    it('IPv4 as is; IPv4-mapped IPv6 as its IPv4', () => {
      expect(ipKey('203.0.113.7')).toBe('203.0.113.7');
      expect(ipKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    });
    it('any other IPv6 as its /64: same prefix same key, different prefix different key', () => {
      expect(ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(ipKey('2001:db8:1:2::9'));
      expect(ipKey('2001:db8:1:2::1')).not.toBe(ipKey('2001:db8:1:3::1'));
      expect(ipKey('2001:db8:1:2::1')).not.toBe(ipKey('203.0.113.7'));
    });
  });

  describe('FixedWindow(windowMs, max)', () => {
    it('allows max adds per key per window, then refuses until the window ends', () => {
      const w = new FixedWindow(60_000, 2);
      expect(w.can('k', 0)).toBe(true);
      w.add('k', 0);
      expect(w.can('k', 1)).toBe(true);
      w.add('k', 1);
      expect(w.can('k', 59_999)).toBe(false);
      expect(w.can('k', 60_000)).toBe(true);
    });
    it('keys are independent, and can() alone never counts', () => {
      const w = new FixedWindow(60_000, 1);
      for (let i = 0; i < 5; i++) expect(w.can('a', 0)).toBe(true);
      w.add('a', 0);
      expect(w.can('a', 10)).toBe(false);
      expect(w.can('b', 10)).toBe(true);
    });
    it('prune(now) forgets expired windows and keeps live ones', () => {
      const w = new FixedWindow(60_000, 1);
      w.add('old', 0);
      w.add('live', 100_000);
      w.prune(120_000);
      expect(w.can('old', 120_000)).toBe(true);
      expect(w.can('live', 120_000)).toBe(false);
      // can() ignores an expired window anyway, so the only way to see the prune is that the entry is gone
      expect((w as unknown as { hits: Map<string, unknown> }).hits.size).toBe(1);
    });
  });
});
