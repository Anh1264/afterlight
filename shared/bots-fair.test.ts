// BL-1 c4 (fair play): "Given 200 seeded mid-match states and a fixed bot random seed, when the hidden information is
// replaced by any other arrangement consistent with what the bot may know (the opponent's hand and deck redealt with
// the same counts, the bot's own deck reordered, the engine RNG seed changed), then every level returns the identical
// action (Hard may run at a reduced iteration count for this test)."
// Own file so vitest runs it in parallel with the c5 file (design R8). The determinize half of c4 is in determinize.test.ts.
import { describe, expect, it } from 'vitest';
import { deckList } from './cards';
import { GameState, PIdx } from './engine';
import { DeckKnowledge } from './determinize';
import { decisionSeed, mulberry } from './rng';
import { BOTS, BotContext, BotPolicy, botDecide, hardPolicy } from './bots';
import { midMatchStates, other, scramble, scrambleCustom } from './bot-fixtures';

const HARD_ITERATIONS_FOR_C4 = 4;
const BOT_SEED = 20261008;

const ctxFor = (g: GameState, me: PIdx, k: number, know: DeckKnowledge): BotContext =>
  ({ rnd: mulberry(decisionSeed(BOT_SEED + k, g.turnNo)), know });

const LEVELS_UNDER_TEST: [string, BotPolicy][] = [
  ['easy', BOTS.easy],
  ['medium', BOTS.medium],
  [`hard (${HARD_ITERATIONS_FOR_C4} iterations)`, hardPolicy({ iterations: HARD_ITERATIONS_FOR_C4 })],
];

const cardIds = (g: GameState, p: PIdx) => [...g.players[p].hand, ...g.players[p].deck].map(c => c.cardId).sort().join();

describe('c4: fair play', () => {
  const starters = midMatchStates(200, 91000);                 // starter decks: the opponent's list is public
  const customs = midMatchStates(50, 92000, true);             // random legal decks: only the house pool is public

  it('the 200 states cover all three rounds and both seats to move', () => {
    const rounds = new Set(starters.map(s => s.g.round));
    expect([...rounds].sort()).toEqual([1, 2, 3]);
    expect(new Set(starters.map(s => s.me)).size).toBe(2);
    for (const s of starters) expect(s.g.over).toBe(false);
  });

  it.each(LEVELS_UNDER_TEST)('c4: %s returns the identical action on 200 starter-deck states when the hidden information is rearranged', { timeout: 120_000 }, (name, policy) => {
    const mismatches: string[] = [];
    let moved = 0;
    for (const s of starters) {
      const know: DeckKnowledge = { oppList: deckList(s.g.players[other(s.me)].house) };
      const sc = scramble(s.g, s.me, s.k * 31 + 7);
      const opp = other(s.me);
      const before = s.g.players[opp].hand.map(c => c.uid + c.cardId).join();
      if (sc.players[opp].hand.map(c => c.uid + c.cardId).join() !== before) moved++;
      const a = botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, s.k, know)).action;
      const b = botDecide(policy, sc, s.me, ctxFor(sc, s.me, s.k, know)).action;
      if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(`state ${s.k} (round ${s.g.round}, seat ${s.me}): ${JSON.stringify(a)} became ${JSON.stringify(b)}`);
    }
    expect(moved, 'states where the scramble actually changed the opponent\'s hand').toBeGreaterThan(170);
    expect(mismatches, `${name}: ${mismatches.length} of ${starters.length} decisions followed the hidden information`).toEqual([]);
  });

  it.each(LEVELS_UNDER_TEST)('c4: %s also ignores the real hidden cards of a custom deck (50 random-deck states, only the house pool known)', { timeout: 120_000 }, (name, policy) => {
    const mismatches: string[] = [];
    for (const s of customs) {
      const know: DeckKnowledge = { oppList: null };
      const sc = scrambleCustom(s.g, s.me, s.k * 13 + 5);
      const a = botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, s.k, know)).action;
      const b = botDecide(policy, sc, s.me, ctxFor(sc, s.me, s.k, know)).action;
      if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(`state ${s.k} (round ${s.g.round}, seat ${s.me}): ${JSON.stringify(a)} became ${JSON.stringify(b)}`);
    }
    expect(mismatches, `${name}: ${mismatches.length} of ${customs.length} decisions followed the real custom deck`).toEqual([]);
  });

  it('the decision does depend on the knowledge it is given: a bot told a different opponent list can decide differently', () => {
    // Guards against a vacuous c4: if decisions ignored `know` and the table entirely, every test above would pass.
    // Hard sees the imagined opponent through `know`, so over many states a wrong list must change at least one move.
    const policy = hardPolicy({ iterations: HARD_ITERATIONS_FOR_C4 });
    let changed = 0;
    for (const s of starters.slice(0, 80)) {
      const right: DeckKnowledge = { oppList: deckList(s.g.players[other(s.me)].house) };
      const wrong: DeckKnowledge = { oppList: null };
      const a = botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, s.k, right)).action;
      const b = botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, s.k, wrong)).action;
      if (JSON.stringify(a) !== JSON.stringify(b)) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});
