// Server limits: durations, abuse limits, client IP resolution and the fixed-window counter.
import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import { TURN_SECONDS } from '../shared/protocol';

export interface ServerLimits {
  /** PvP turn clock */
  turnMs: number;
  /** how long a dropped seat in a running match has to come back */
  dropGraceMs: number;
  /** a bot match with no human action for this long is ended ('idle') */
  botIdleMs: number;
  /** a lobby or finished match with no connected human is swept this long after the last human left */
  lobbyIdleMs: number;
  /** a room with no connected human, untouched this long, is swept */
  roomIdleMs: number;
  sweepEveryMs: number;
  /** live rooms, all visitors */
  maxRooms: number;
  /** open sockets, all visitors */
  maxSockets: number;
  maxSocketsPerIp: number;
  createsPerSocketPerMin: number;
  createsPerIpPerMin: number;
}

export const DEFAULT_LIMITS: ServerLimits = {
  turnMs: TURN_SECONDS * 1000,
  dropGraceMs: 60_000,
  botIdleMs: 15 * 60_000,
  lobbyIdleMs: 2 * 60_000,
  roomIdleMs: 30 * 60_000,
  sweepEveryMs: 30_000,
  maxRooms: 10_000,
  maxSockets: 2_000,
  maxSocketsPerIp: 40,
  createsPerSocketPerMin: 10,
  createsPerIpPerMin: 60,
};

export type TrustProxy = 'x-real-ip' | 'none';

/** X-Real-IP if trust is 'x-real-ip' and net.isIP() accepts it (a duplicated header arrives joined as "a, b" and fails), else remoteAddress. */
export function clientIp(headers: IncomingHttpHeaders, remoteAddress: string, trust: TrustProxy): string {
  if (trust === 'x-real-ip') {
    const h = headers['x-real-ip'];
    if (typeof h === 'string' && isIP(h) !== 0) return h;
  }
  return remoteAddress;
}

/** Limit key: IPv4 as is, IPv4-mapped IPv6 as its IPv4, any other IPv6 as its /64 prefix. */
export function ipKey(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (isIP(ip) !== 6) return ip;
  const [head, tail = ''] = ip.split('::');
  const first = head === '' ? [] : head.split(':');
  const last = ip.includes('::') ? (tail === '' ? [] : tail.split(':')) : [];
  const groups = ip.includes('::') ? [...first, ...Array<string>(Math.max(0, 8 - first.length - last.length)).fill('0'), ...last] : first;
  return groups.slice(0, 4).map(g => parseInt(g || '0', 16).toString(16)).join(':') + '::/64';
}

/** Counts adds per key inside a fixed window that starts at the key's first add. can() never counts. */
export class FixedWindow {
  private readonly hits = new Map<string, { start: number; n: number }>();
  constructor(private readonly windowMs: number, private readonly max: number) {}
  can(key: string, now: number): boolean {
    const h = this.hits.get(key);
    return !h || now - h.start >= this.windowMs || h.n < this.max;
  }
  add(key: string, now: number): void {
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) this.hits.set(key, { start: now, n: 1 });
    else h.n++;
  }
  prune(now: number): void {
    for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k);
  }
}
