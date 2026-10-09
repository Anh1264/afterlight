// Seeded randomness shared by the simulator, the bots and the ladder. Pure: no Math.random, no clock.

/** mulberry32: a small seeded stream of floats in [0, 1). Moved verbatim from sim.ts. */
export function mulberry(seed: number) { return () => { let t = (seed = (seed + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** MurmurHash3's 32-bit finalizer: a bijection on uint32 that spreads nearby inputs apart. */
function fmix32(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * uint32 seed for one bot decision: fmix32(botSeed ^ Math.imul(turnNo + 1, 0x9e3779b1)).
 * A decision is a function of (state, botSeed, knowledge, policy id), so one recorded state reproduces one decision,
 * whether it runs in a worker or not (ADR 0004).
 */
export function decisionSeed(botSeed: number, turnNo: number): number {
  return fmix32(botSeed ^ Math.imul(turnNo + 1, 0x9e3779b1));
}
