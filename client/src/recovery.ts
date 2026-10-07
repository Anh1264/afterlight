/** A newer server boot than the one we saw, by more than floor and round-trip jitter, means the match died with a restart. */
export const BOOT_TOLERANCE_MS = 5000;

/** The server's boot time, from its uptime in seconds. Compare boot times, not message times: deploys overlap old and new servers. */
export function bootAt(uptimeS: number, now: number): number { return now - uptimeS * 1000; }

export function lostMatch(seenBootAt: number | null, nowBootAt: number | null): 'restarted' | 'ended' {
  return seenBootAt !== null && nowBootAt !== null && nowBootAt - seenBootAt > BOOT_TOLERANCE_MS ? 'restarted' : 'ended';
}

export const RESTARTED = 'The server restarted and your match was lost. Sorry! Start a new one.';
export const ENDED = 'That match has ended. Start a new one.';
export const OFFLINE = "Can't reach the server. Retrying...";

/** Server uptime in seconds from /health, or null when unreachable or not reported. */
export async function fetchUptimeS(): Promise<number | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2000);
  try {
    const r = await fetch('/health', { signal: ac.signal });
    const j: unknown = await r.json();
    const u = typeof j === 'object' && j !== null ? (j as { uptimeS?: unknown }).uptimeS : undefined;
    return typeof u === 'number' ? u : null;
  } catch (e) {
    console.warn('/health unreachable', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
