// Abuse checks against a running server. Usage: tsx scripts/abuse.ts <malformed|flood|spoof> [baseUrl]
// Exit code 0 when the server held up, 1 when a check failed. Prints one PASS or FAIL line per check.
// Run `flood` and `spoof` against production only on purpose: they block your IP's creates and sockets for a minute.
import { io, type Socket } from 'socket.io-client';

const mode = process.argv[2];
const base = (process.argv[3] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failed++; };
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function health(): Promise<{ ok: boolean; rooms: number; sockets: number }> {
  try {
    const res = await fetch(`${base}/health`);
    const j: unknown = await res.json();
    const o = typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : {};
    return { ok: res.status === 200, rooms: Number(o.rooms), sockets: Number(o.sockets) };
  } catch (e) {
    console.log(`health request failed: ${String(e)}`);
    return { ok: false, rooms: NaN, sockets: NaN };
  }
}

function connect(ip?: string): Promise<Socket> {
  const s = io(base, { forceNew: true, reconnection: false, transports: ['websocket'], extraHeaders: ip ? { 'x-real-ip': ip } : {} });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { s.close(); reject(new Error('connect timed out after 5 s')); }, 5000);
    s.once('connect', () => { clearTimeout(t); resolve(s); });
    s.once('connect_error', e => { clearTimeout(t); s.close(); reject(e); });
  });
}

const ask = (s: Socket, ev: string, payload?: unknown): Promise<unknown> => s.timeout(5000).emitWithAck(ev, payload);
const hasError = (r: unknown) => typeof r === 'object' && r !== null && 'error' in r;

async function malformed() {
  const s = await connect();
  const junk: unknown[] = [undefined, null, 42, 'x', [], {}, { type: 'play', uid: 42 }, { type: 'launch' }, { code: 7 }, 'A'.repeat(5000), Array(10_000).fill('card')];
  const events = ['room:create', 'room:join', 'lobby:house', 'lobby:deck', 'lobby:ready', 'game:action', 'game:forfeit', 'game:rematch'];
  let noAck = 0;
  for (const ev of events) for (const j of junk) { s.emit(ev, j); noAck++; }
  let answered = 0;
  for (const ev of ['room:create', 'room:join', 'game:action', 'lobby:deck']) {
    if (hasError(await ask(s, ev, { code: 7, type: 'launch', uid: 42 }))) answered++;
  }
  check(answered === 4, `${noAck} junk emits without an ack, then 4 junk emits with an ack all answer {error}`);
  check(s.connected, 'the junk sender is still connected');
  check((await health()).ok, '/health answers 200 after the junk');
  const big = await connect();
  const dropped = new Promise<boolean>(r => { big.once('disconnect', () => r(true)); void sleep(5000).then(() => r(false)); });
  big.emit('game:action', 'x'.repeat(1_200_000));
  check(await dropped, 'a message over 1 MB disconnects its sender');
  check(s.connected && (await health()).ok, 'other sockets and /health are unaffected by the oversized message');
  s.close(); big.close();
}

async function flood() {
  const before = await health();
  const s = await connect();
  const acks = await Promise.all(Array.from({ length: 1000 }, () => ask(s, 'room:create', { name: 'Abuse', vsBot: true })));
  const accepted = acks.filter(a => !hasError(a)).length;
  const after = await health();
  console.log(`accepted ${accepted}, refused ${1000 - accepted}, rooms ${before.rooms} -> ${after.rooms}`);
  check(accepted <= 10, 'at most 10 creates accepted from one socket');
  check(after.rooms - before.rooms <= 1, 'the socket holds at most one live room');
  check(after.ok, '/health answers 200 after the flood');
  s.close();
}

async function spoof() {
  const open: Socket[] = [];
  let refused = 0;
  const TEXT = 'Too many connections from your network. Try again later.';
  for (let i = 1; i <= 41; i++) {
    try { open.push(await connect(`198.51.100.${i}`)); } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`socket ${i} refused: ${msg}`);
      if (msg === TEXT) refused++;
    }
  }
  console.log(`41 sockets, each with a different X-Real-IP: ${open.length} connected, ${refused} refused with the per-IP text`);
  check(refused >= 1, 'one socket was refused, so a client-supplied X-Real-IP does not dodge the per-IP cap (ADR 0002)');
  open.forEach(s => s.close());
}

const modes: Record<string, () => Promise<void>> = { malformed, flood, spoof };
const run = modes[mode ?? ''];
if (!run) {
  console.error('usage: tsx scripts/abuse.ts <malformed|flood|spoof> [baseUrl]');
  process.exit(2);
}
console.log(`abuse ${mode} against ${base}`);
try { await run(); } catch (e) { check(false, `script error: ${e instanceof Error ? e.message : String(e)}`); }
process.exit(failed ? 1 : 0);
