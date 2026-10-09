import { describe, it, expect } from 'vitest';
import { ALL_HOUSES, House, validateDeck } from './cards';
import { PIdx, applyAction, createGame, validate } from './engine';
import { candidatePlays, decide } from './bot';
import { mulberry, playMatch, randomDeck } from './sim';

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

// BL-1 fuzzer checks (design section 6): on the random-deck matches, every 5th state also checks that
//  (a) the custom-deck determinize (oppList: null) rebuilds a legal deck, and
//  (b) Easy and Medium, through the fair harness, return an action the engine accepts.
// The BL-1 modules are imported inside the test so the two fuzz tests above keep running while they do not exist yet.
describe('fuzz-lite: bot fairness plumbing on random-deck matches (BL-1)', () => {
  it('every 5th state of 120 random-deck matches: unknown-list determinize is a legal deck; Easy and Medium play legal moves', { timeout: 60_000 }, async () => {
    const { determinize, revealedCards } = await import('./determinize');
    const { BOTS, botDecide } = await import('./bots');
    const { decisionSeed } = await import('./rng');
    let checked = 0;
    for (let s = 0; s < 120; s++) {
      const seed = 110000 + s;
      const houses: [House, House] = [ALL_HOUSES[s % 4], ALL_HOUSES[(s >> 2) % 4]];
      const rnd = mulberry(seed * 7 + 1);
      const decks: [string[], string[]] = [randomDeck(houses[0], rnd), randomDeck(houses[1], rnd)];
      const { state: g } = createGame({ houses, seed, first: (s % 2) as PIdx, decks });
      for (let n = 0; n < 400 && !g.over; n++) {
        const p = g.current;
        if (n % 5 === 0) {
          checked++;
          const opp: PIdx = p === 0 ? 1 : 0;
          const v = determinize(g, p, mulberry(seed + n), { oppList: null });
          const o = v.players[opp];
          const ids = [...revealedCards(g, opp), ...[...o.hand, ...o.deck].map(c => c.cardId)];
          expect(validateDeck(o.house, ids), `seed ${seed} action ${n}: rebuilt opponent deck`).toBeNull();
          for (const policy of [BOTS.easy, BOTS.medium]) {
            const ctx = { rnd: mulberry(decisionSeed(seed, g.turnNo)), know: { oppList: null } };
            const a = botDecide(policy, g, p, ctx).action;
            expect(validate(g, p, a), `seed ${seed} action ${n}: ${policy.level} played ${JSON.stringify(a)}`).toBeNull();
          }
        }
        const plays = candidatePlays(g, p);
        const a = s % 2 === 0
          ? (rnd() < 0.12 || !plays.length ? { type: 'pass' as const } : plays[Math.floor(rnd() * plays.length)])
          : decide(g, p, rnd);
        const r = applyAction(g, p, a);
        if ('error' in r) throw new Error(`seed ${seed}: illegal ${JSON.stringify(a)}: ${r.error}`);
      }
      expect(g.over, `seed ${seed}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(600);
  });
});
