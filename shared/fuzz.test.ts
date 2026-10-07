import { describe, it, expect } from 'vitest';
import { ALL_HOUSES, House } from './cards';
import { PIdx } from './engine';
import { playMatch } from './sim';

// Fuzz-lite: a short seeded burst on every `npm run check`. Seeds are disjoint from the CLI's (0-299, 1000+, 9000+).
// playMatch checks invariants after every action and throws if a match does not finish or an action is illegal.
const PAIRS: [House, House][] = ALL_HOUSES.flatMap(a => ALL_HOUSES.filter(b => b !== a).map((b): [House, House] => [a, b]));
const REPEATS = 25;
const RANDOM_DECK_MATCHES = 360;

describe('fuzz-lite', () => {
  it('random-bot matches with starter decks finish cleanly: 12 ordered house pairs, both seats', { timeout: 60_000 }, () => {
    let n = 0;
    for (const [a, b] of PAIRS) for (let seat = 0; seat < 2; seat++) for (let r = 0; r < REPEATS; r++) {
      const seed = 50000 + n;
      const { g } = playMatch(a, b, seed, seat as PIdx, true);
      expect(g.over, `${a} v ${b} seed ${seed}`).toBe(true);
      n++;
    }
    expect(n).toBe(PAIRS.length * 2 * REPEATS);
  });

  it('matches with random legal decks finish cleanly', { timeout: 60_000 }, () => {
    for (let s = 0; s < RANDOM_DECK_MATCHES; s++) {
      const seed = 70000 + s;
      const { g } = playMatch(ALL_HOUSES[s % 4], ALL_HOUSES[(s >> 2) % 4], seed, (s % 2) as PIdx, s % 2 === 0, true);
      expect(g.over, `seed ${seed}`).toBe(true);
    }
  });
});
