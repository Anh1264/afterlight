import { describe, expect, it } from 'vitest';
import { BOOT_TOLERANCE_MS, bootAt, lostMatch } from './recovery';

/** PR 5 c6: why did the rejoin fail? Compare server boot times, not message times (deploys overlap old and new servers). */

const NOW = 1_000_000_000_000;

describe('bootAt', () => {
  it('is now minus the uptime in milliseconds', () => {
    expect(bootAt(0, NOW)).toBe(NOW);
    expect(bootAt(5, NOW)).toBe(NOW - 5000);
    expect(bootAt(3600, NOW)).toBe(NOW - 3_600_000);
  });
});

describe('BOOT_TOLERANCE_MS', () => {
  it('is 5000', () => { expect(BOOT_TOLERANCE_MS).toBe(5000); });
});

describe('lostMatch', () => {
  it('restarted: a plain restart (the server we reach booted a minute after the one we played on)', () => {
    const seen = bootAt(3600, NOW - 120_000);
    const now = bootAt(2, NOW);
    expect(lostMatch(seen, now)).toBe('restarted');
  });
  it('restarted: deploy overlap. The new server booted BEFORE the tab last heard from the old one, but after the old boot', () => {
    const oldBoot = NOW - 3_600_000;
    const newBoot = NOW - 40_000; // booted 40 s ago; the old server kept sending until 10 s ago
    const lastMessageAt = NOW - 10_000;
    expect(newBoot).toBeLessThan(lastMessageAt);
    expect(lostMatch(oldBoot, newBoot)).toBe('restarted');
  });
  it('ended: the same server (boot times differ only by floor and round trip)', () => {
    const seen = bootAt(100, NOW - 60_000);
    const now = bootAt(160, NOW); // floored uptime and latency jitter, about 1 s
    expect(Math.abs(now - seen)).toBeLessThan(BOOT_TOLERANCE_MS);
    expect(lostMatch(seen, now)).toBe('ended');
  });
  it('ended: the lid was closed and the match swept, same server', () => {
    expect(lostMatch(NOW - 7_200_000, NOW - 7_200_000 + 999)).toBe('ended');
  });
  it('ended: exactly at the tolerance (5000 ms later is not "later than")', () => {
    expect(lostMatch(NOW, NOW + 5000)).toBe('ended');
  });
  it('restarted: 5001 ms later', () => {
    expect(lostMatch(NOW, NOW + 5001)).toBe('restarted');
  });
  it('ended: the server we reach now booted earlier than the one we saw (clock skew or an older instance)', () => {
    expect(lostMatch(NOW, NOW - 60_000)).toBe('ended');
  });
  it('ended: the tab never learned a boot time', () => {
    expect(lostMatch(null, NOW)).toBe('ended');
  });
  it('ended: /health is unreachable or reports no uptime', () => {
    expect(lostMatch(NOW - 60_000, null)).toBe('ended');
  });
  it('ended: both null', () => {
    expect(lostMatch(null, null)).toBe('ended');
  });
});
