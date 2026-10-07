import { afterEach, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import type WebSocket from 'ws';
import { as2b, ask, bootServer, client, health, next, rawEngine, roomCount, sleep, startBotMatch, until, type Booted } from './testkit';

// PR 2b, criterion c4: the per-visitor limit. Real servers on a random port, real sockets.
// Spec: docs/specs/demo-mvp.md, PR 2 c4, and the design's "Abuse limits (2b)" table + ADR 0002 (X-Real-IP).

const TOO_MANY_CREATES = 'Too many new matches, try again in a minute.';
const TOO_MANY_CONNECTIONS = 'Too many connections from your network. Try again later.';

const booted: Booted[] = [];
const socks: Socket[] = [];
const raws: WebSocket[] = [];

afterEach(async () => {
  for (const s of socks.splice(0)) s.close();
  for (const w of raws.splice(0)) w.terminate();
  await Promise.all(booted.splice(0).map(b => b.srv.close()));
});

/** A server that trusts X-Real-IP (as on Railway) unless the test says otherwise. */
const boot = async (o: object = {}) => { const b = await bootServer(as2b({ trustProxy: 'x-real-ip', ...o })); booted.push(b); return b; };
const connect = async (url: string, ip?: string) => { const s = client(url, { ip }); socks.push(s); await next(s, 'connect'); return s; };
const isErr = (r: unknown) => typeof r === 'object' && r !== null && 'error' in r;

/** One bot-room create from a fresh socket on `ip`; the raw ack. */
async function createFrom(url: string, ip: string): Promise<unknown> {
  const s = await connect(url, ip);
  return ask(s, 'room:create', { name: 'Ann', vsBot: true });
}

describe('c4 per-visitor limit', () => {
  it('c4: a client sending room:create 1,000 times holds at most one live room per socket', async () => {
    const { url } = await boot();
    const s = await connect(url, '10.1.0.1');
    await Promise.all(Array.from({ length: 1000 }, () => s.timeout(10_000).emitWithAck('room:create', { name: 'Ann', vsBot: true })));
    expect(await roomCount(url)).toBeLessThanOrEqual(1);
  });

  it('c4: creates past the per-client limit get exactly "Too many new matches, try again in a minute." (10 accepted of 1,000)', async () => {
    const { url } = await boot();
    const s = await connect(url, '10.1.0.2');
    const acks = await Promise.all(Array.from({ length: 1000 }, () => s.timeout(10_000).emitWithAck('room:create', { name: 'Ann', vsBot: true })));
    const accepted = acks.filter(a => !isErr(a));
    const refused = acks.filter(a => isErr(a));
    expect(accepted).toHaveLength(10);
    expect(refused).toHaveLength(990);
    for (const r of refused) expect(r).toEqual({ error: TOO_MANY_CREATES });
    expect(await roomCount(url)).toBeLessThanOrEqual(1);
  });

  it('c4: 20 sockets from one IP (an office NAT) can each still start a bot match within a minute', async () => {
    const { url } = await boot();
    for (let i = 0; i < 20; i++) {
      const m = await startBotMatch(url, '10.1.0.3');
      socks.push(m.s);
    }
    expect(await roomCount(url)).toBe(20);
  });

  it('c4: the per-IP create limit refuses a fresh socket on the same IP, and a second IP is unaffected', async () => {
    const { url } = await boot({ limits: { createsPerIpPerMin: 5 } });
    const first = await connect(url, '10.1.1.1');
    const second = await connect(url, '10.1.1.1');
    const third = await connect(url, '10.1.1.1');
    for (const [s, n] of [[first, 2], [second, 2], [third, 1]] as const) {
      for (let i = 0; i < n; i++) expect(isErr(await ask(s, 'room:create', { name: 'Ann', vsBot: true }))).toBe(false);
    }
    // five accepted from 10.1.1.1: a brand-new socket (no creates of its own) is refused, so the key is the IP
    expect(await createFrom(url, '10.1.1.1')).toEqual({ error: TOO_MANY_CREATES });
    expect(await ask(first, 'room:create', { name: 'Ann', vsBot: true })).toEqual({ error: TOO_MANY_CREATES });
    // another visitor is unaffected
    expect(isErr(await createFrom(url, '10.1.1.2'))).toBe(false);
  });

  it('c4: the client IP comes from X-Real-IP when trusted: a different header value is a different visitor', async () => {
    const { url } = await boot({ limits: { createsPerIpPerMin: 1 } });
    expect(isErr(await createFrom(url, '10.1.2.1'))).toBe(false);
    expect(isErr(await createFrom(url, '10.1.2.2'))).toBe(false); // would be refused if every socket shared 127.0.0.1
    expect(await createFrom(url, '10.1.2.1')).toEqual({ error: TOO_MANY_CREATES });
  });

  it('c4: with trustProxy "none" a client-supplied X-Real-IP is ignored, so rotating it cannot dodge the limit', async () => {
    const { url } = await boot({ trustProxy: 'none', limits: { createsPerIpPerMin: 3 } });
    for (const ip of ['10.1.3.1', '10.1.3.2', '10.1.3.3']) expect(isErr(await createFrom(url, ip))).toBe(false);
    expect(await createFrom(url, '10.1.3.4')).toEqual({ error: TOO_MANY_CREATES });
  });

  it('c4: with trustProxy "x-real-ip" a malformed or duplicated header falls back to the socket address, so it cannot mint visitors', async () => {
    const { url } = await boot({ limits: { createsPerIpPerMin: 3 } });
    // "1.1.1.1, 2.2.2.2" is how a duplicated header arrives; node's net.isIP() rejects all four
    for (const bad of ['junk-a', 'junk-b', '1.1.1.1, 2.2.2.2']) expect(isErr(await createFrom(url, bad))).toBe(false);
    expect(await createFrom(url, '999.1.1.1')).toEqual({ error: TOO_MANY_CREATES });
  });

  it('c4: IPv6 visitors are keyed by their /64 and an IPv4-mapped address by its IPv4', async () => {
    const { url } = await boot({ limits: { createsPerIpPerMin: 2 } });
    // same /64 (2001:db8:1:2::/64), rotating the host part
    expect(isErr(await createFrom(url, '2001:db8:1:2:aaaa::1'))).toBe(false);
    expect(isErr(await createFrom(url, '2001:db8:1:2:bbbb::2'))).toBe(false);
    expect(await createFrom(url, '2001:db8:1:2:cccc::3')).toEqual({ error: TOO_MANY_CREATES });
    // a different /64 is a different visitor
    expect(isErr(await createFrom(url, '2001:db8:1:3::1'))).toBe(false);
  });

  it('c4: ::ffff:a.b.c.d counts as a.b.c.d', async () => {
    const { url } = await boot({ limits: { createsPerIpPerMin: 1 } });
    expect(isErr(await createFrom(url, '10.1.4.9'))).toBe(false);
    expect(await createFrom(url, '::ffff:10.1.4.9')).toEqual({ error: TOO_MANY_CREATES });
  });

  it('c4: maxSocketsPerIp: the next socket from that IP is refused with "Too many connections from your network. Try again later."; other IPs connect', async () => {
    const { url } = await boot({ limits: { maxSocketsPerIp: 3 } });
    const open = [await connect(url, '10.1.5.1'), await connect(url, '10.1.5.1'), await connect(url, '10.1.5.1')];
    const refused = client(url, { ip: '10.1.5.1' });
    socks.push(refused);
    expect(await next<string>(refused, 'connect_error')).toBe(TOO_MANY_CONNECTIONS);
    expect(refused.connected).toBe(false);
    await connect(url, '10.1.5.2'); // another visitor is fine
    // counted live: closing one frees a slot (poll: the server notices the close asynchronously)
    open[0].close();
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      const again = client(url, { ip: '10.1.5.1' });
      socks.push(again);
      ok = await Promise.race([
        next(again, 'connect').then(() => true),
        next(again, 'connect_error').then(() => false),
      ]);
      if (!ok) { again.close(); await sleep(50); }
    }
    expect(ok).toBe(true);
  });

  it('c4: maxSocketsPerIp also holds against a spoofed X-Real-IP when the header is not trusted', async () => {
    const { url } = await boot({ trustProxy: 'none', limits: { maxSocketsPerIp: 2 } });
    await connect(url, '10.1.6.1');
    await connect(url, '10.1.6.2');
    const third = client(url, { ip: '10.1.6.3' });
    socks.push(third);
    expect(await next<string>(third, 'connect_error')).toBe(TOO_MANY_CONNECTIONS);
  });

  it('c4: refused connections do not use up a slot (a socket refused ten times does not lock the IP out)', async () => {
    const { url } = await boot({ limits: { maxSocketsPerIp: 1 } });
    const keeper = await connect(url, '10.1.7.1');
    for (let i = 0; i < 10; i++) {
      const r = client(url, { ip: '10.1.7.1' });
      socks.push(r);
      expect(await next<string>(r, 'connect_error')).toBe(TOO_MANY_CONNECTIONS);
      r.close();
    }
    keeper.close();
    await until('a new socket from that IP connecting', async () => {
      const s = client(url, { ip: '10.1.7.1' });
      socks.push(s);
      const ok = await Promise.race([next(s, 'connect').then(() => true), next(s, 'connect_error').then(() => false)]);
      if (!ok) s.close();
      return ok;
    }, true, 4000);
  });

  it('c4: the per-socket limit applies on its own (createsPerSocketPerMin 2), and a second socket is unaffected', async () => {
    const { url } = await boot({ limits: { createsPerSocketPerMin: 2 } });
    const a = await connect(url, '10.1.8.1');
    expect(isErr(await ask(a, 'room:create', { name: 'Ann', vsBot: true }))).toBe(false);
    expect(isErr(await ask(a, 'room:create', { name: 'Ann', vsBot: true }))).toBe(false);
    expect(await ask(a, 'room:create', { name: 'Ann', vsBot: true })).toEqual({ error: TOO_MANY_CREATES });
    const b = await connect(url, '10.1.8.1');
    expect(isErr(await ask(b, 'room:create', { name: 'Ann', vsBot: true }))).toBe(false);
  });

  it('c4: many Socket.IO CONNECT packets on one engine.io websocket cannot beat maxSocketsPerIp: the server closes it (50 CONNECTs, cap 3: at most 1 socket, at most 2 limited)', async () => {
    const { url } = await boot({ trustProxy: 'none', limits: { maxSocketsPerIp: 3 } });
    const ws = await rawEngine(url);
    if (!ws) throw new Error('the engine connection was refused');
    raws.push(ws);
    const closed = new Promise<void>(resolve => ws.once('close', () => resolve()));
    for (let i = 0; i < 50; i++) ws.send('40'); // namespace CONNECT, all in the same tick
    await Promise.race([closed, sleep(2000).then(() => { throw new Error('the server did not close the engine connection within 2 s'); })]);
    for (let i = 0; i < 6; i++) {
      const h = await health(url);
      expect(h.sockets as number).toBeLessThanOrEqual(1);
      expect((h.counts as Record<string, number>).limited).toBeLessThanOrEqual(2);
      await sleep(50);
    }
    const fresh = await connect(url);
    expect(fresh.connected).toBe(true);
  });

  it('c4: one polling POST carrying 1,000 CONNECT packets is cut off: the session closes, at most 2 are limited, and the IP is not locked out', async () => {
    const { url } = await boot({ trustProxy: 'none', limits: { maxSocketsPerIp: 3 } });
    const open = await (await fetch(`${url}/socket.io/?EIO=4&transport=polling`)).text();
    const sid = (JSON.parse(open.slice(1)) as { sid: string }).sid;
    const poll = `${url}/socket.io/?EIO=4&transport=polling&sid=${sid}`;
    const body = Array.from({ length: 1000 }, () => '40').join('\x1e');
    await fetch(poll, { method: 'POST', body, headers: { 'content-type': 'text/plain;charset=UTF-8' } });
    // the session is closed within 1 s: an unknown sid answers HTTP 400, or a close packet ('1') is delivered
    const t0 = Date.now();
    let closed = false;
    while (!closed && Date.now() - t0 < 1000) {
      try {
        const r = await fetch(poll, { signal: AbortSignal.timeout(250) });
        closed = r.status === 400 || (await r.text()).split('\x1e').includes('1');
      } catch (e) {
        // expected: the 250 ms abort of a long poll that has nothing to say, i.e. the session is still open; anything else is a real failure
        if (!(e instanceof DOMException && e.name === 'TimeoutError')) throw e;
      }
    }
    expect(closed, 'the polling session was closed within 1 s').toBe(true);
    for (let i = 0; i < 4; i++) {
      const h = await health(url);
      expect(h.sockets as number).toBeLessThanOrEqual(1);
      expect((h.counts as Record<string, number>).limited).toBeLessThanOrEqual(2);
      await sleep(50);
    }
    const fresh = await connect(url);
    expect(fresh.connected).toBe(true);
  });

  it('c4: raw engine connections that never join a namespace cannot lock other IPs out, and one IP holds at most 2 x maxSocketsPerIp of them', async () => {
    const { url } = await boot({ limits: { maxSockets: 20, maxSocketsPerIp: 3 } });
    let opened = 0;
    for (let i = 0; i < 25; i++) {
      const ws = await rawEngine(url, '10.9.9.9');
      if (ws) { raws.push(ws); opened++; }
    }
    expect(opened).toBe(6);
    const visitor = client(url, { ip: '10.1.1.1' });
    socks.push(visitor);
    await next(visitor, 'connect');
    expect(isErr(await ask(visitor, 'room:create', { name: 'Ann', vsBot: true }))).toBe(false);
  });

  describe('ip_fallback warning (trustProxy x-real-ip, header missing)', () => {
    const fallbacks = (logs: { message: string }[]) => logs.filter(l => l.message === 'ip_fallback');

    it('c9: a connection without X-Real-IP writes one warn ip_fallback line with no IP in it; a second within the minute writes none', async () => {
      const { url, logs } = await boot();
      await connect(url); // no header
      const lines = fallbacks(logs);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ level: 'warn', message: 'ip_fallback' });
      const text = JSON.stringify(lines[0]);
      for (const v of ['127.0.0.1', '::1', 'ffff']) expect(text).not.toContain(v);
      await connect(url);
      await connect(url, 'not-an-ip'); // a malformed header falls back too, but the minute's line is already written
      expect(fallbacks(logs)).toHaveLength(1);
    });

    it('c9: a connection with a valid X-Real-IP writes no ip_fallback line', async () => {
      const { url, logs } = await boot();
      await connect(url, '10.6.0.1');
      await connect(url, '2001:db8::5');
      expect(fallbacks(logs)).toHaveLength(0);
    });

    it('c9: with trustProxy "none" there is nothing to fall back from, so no ip_fallback line', async () => {
      const { url, logs } = await boot({ trustProxy: 'none' });
      await connect(url);
      expect(fallbacks(logs)).toHaveLength(0);
    });
  });

  it('c4: maxSocketsPerIp 0 (PR 5 harness): the visitor gets the per-IP text as connect_error, not a transport error, and the client does not retry', async () => {
    const { url } = await boot({ limits: { maxSocketsPerIp: 0 } });
    const s = io(url, { forceNew: true, transports: ['websocket'], reconnection: true, reconnectionDelay: 50 });
    socks.push(s);
    const errors: string[] = [];
    let attempts = 0;
    s.on('connect_error', e => errors.push(e.message));
    s.io.on('reconnect_attempt', () => { attempts++; });
    await until('first connect_error', () => errors.length > 0, true, 1000);
    await sleep(600); // room for retries to show
    expect(errors).toEqual(['Too many connections from your network. Try again later.']);
    expect(attempts).toBe(0);
  });

  it('c4: a Socket.IO client may DISCONNECT and CONNECT again on the same engine connection: it is admitted the second time and not closed', async () => {
    const { url } = await boot({ trustProxy: 'none', limits: { maxSocketsPerIp: 3 } });
    const ws = await rawEngine(url);
    if (!ws) throw new Error('the engine connection was refused');
    raws.push(ws);
    const got: string[] = [];
    let closed = false;
    ws.on('message', d => { got.push(String(d)); });
    ws.on('close', () => { closed = true; });
    const connectedCount = () => got.filter(m => m.startsWith('40{')).length; // the namespace "connected" packet
    ws.send('40');
    await until('first admission', connectedCount, 1, 2000);
    ws.send('41'); // namespace DISCONNECT
    await until('sockets', async () => (await health(url)).sockets, 0, 2000);
    ws.send('40');
    await until('second admission', connectedCount, 2, 2000);
    await sleep(300);
    expect(closed).toBe(false);
    expect((await health(url)).sockets).toBe(1);
  });
});
