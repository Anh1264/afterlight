// BL-1 c5 (no thrown matches): "Given 1,000 sim states where the opponent has passed, the bot is behind in a round it
// must win to stay in the match, and it holds a card that would put it strictly ahead, then no level passes."
// Own file so vitest runs it in parallel with the c4 file (design R8).
import { describe, expect, it } from 'vitest';
import { deckList } from './cards';
import { GameState, PIdx, totals, validate } from './engine';
import { bestPlay, bestTakingPlay, passThrowsMatch } from './bot';
import { determinize } from './determinize';
import { decisionSeed, mulberry } from './rng';
import { BOTS, BotContext, BotPolicy, botDecide, hardPolicy } from './bots';
import { noThrowStates, other, passLosesMatch } from './bot-fixtures';

const STATES = noThrowStates(1000, 94000, bestTakingPlay);

const ctxFor = (g: GameState, me: PIdx, k: number): BotContext =>
  ({ rnd: mulberry(decisionSeed(k, g.turnNo)), know: { oppList: deckList(g.players[other(me)].house) } });

describe('c5: no thrown matches', () => {
  it('the 1,000 positions are what c5 describes: opponent passed, bot behind, passing loses the match, a taking card in hand', () => {
    expect(STATES).toHaveLength(1000);
    for (const s of STATES) {
      const g = s.g;
      expect(g.over).toBe(false);
      expect(g.current).toBe(s.me);
      expect(g.players[other(s.me)].passed).toBe(true);
      const t = totals(g);
      expect(t[s.me], 'bot is behind').toBeLessThan(t[other(s.me)]);
      expect(passLosesMatch(g, s.me), 'passing loses the match').toBe(true);
      expect(bestTakingPlay(g, s.me), 'a single card puts the bot strictly ahead').not.toBeNull();
    }
    expect(new Set(STATES.map(s => s.g.round)), 'rounds covered').toContain(3);
    expect(new Set(STATES.map(s => s.k)).size, 'distinct matches').toBeGreaterThan(300);
  });

  it('passThrowsMatch is true on every one of them', () => {
    for (const s of STATES) expect(passThrowsMatch(s.g, s.me), `match ${s.k} turn ${s.g.turnNo}`).toBe(true);
  });

  const levels: [string, BotPolicy][] = [
    ['easy', BOTS.easy],
    ['medium', BOTS.medium],
    ['hard (2 iterations)', hardPolicy({ iterations: 2 })],
  ];

  it.each(levels)('c5: %s never passes on 1,000 positions where passing loses the match', { timeout: 120_000 }, (name, policy) => {
    const passes: string[] = [];
    const leaned: string[] = [];
    STATES.forEach((s, i) => {
      const { action, guarded } = botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, i));
      expect(validate(s.g, s.me, action), `position ${i}`).toBeNull();
      if (action.type === 'pass') passes.push(`position ${i} (match ${s.k}, round ${s.g.round}, turn ${s.g.turnNo})`);
      if (guarded) leaned.push(`position ${i}`);
    });
    expect(passes, `${name} threw ${passes.length} matches`).toEqual([]);
    expect(leaned, `${name} only avoided passing because the harness guard stepped in ${leaned.length} times; the level itself must not pass`).toEqual([]);
  });

  it('c5: the guard is part of the harness: a fake policy that always passes comes back guarded with a legal play', () => {
    const alwaysPass: BotPolicy = { level: 'fake', version: 'pass-1', decide: () => ({ type: 'pass' }) };
    STATES.forEach((s, i) => {
      const move = botDecide(alwaysPass, s.g, s.me, ctxFor(s.g, s.me, i));
      expect(move.guarded, `position ${i}`).toBe(true);
      expect(move.action.type).toBe('play');
      expect(validate(s.g, s.me, move.action), `position ${i}`).toBeNull();
    });
  });

  it('c5: the guard replaces a pass with the best-scoring play of the bot\'s own view', () => {
    const alwaysPass: BotPolicy = { level: 'fake', version: 'pass-1', decide: () => ({ type: 'pass' }) };
    STATES.slice(0, 100).forEach((s, i) => {
      const ctx = ctxFor(s.g, s.me, i);
      const view = determinize(s.g, s.me, ctxFor(s.g, s.me, i).rnd, ctx.know);
      expect(botDecide(alwaysPass, s.g, s.me, ctx).action).toEqual(bestPlay(view, s.me)?.play);
    });
  });
});
