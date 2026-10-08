// Hard's search (shared/bot-mcts.ts). Migrated for BL-1: the leaky determinize and decideMcts are gone (the shared
// determinize lives in determinize.ts, tested in determinize.test.ts; decisions go through botDecide), searchMcts takes the
// fair view plus what the bot knows, and the shortlist drops a pass that would throw the match.
import { describe, it, expect, vi } from 'vitest';
import * as mcts from './bot-mcts';
import { HARD_ITERATIONS, MCTS_DEFAULTS, MCTS_VERSION, rootMoves, searchMcts } from './bot-mcts';
import { ALL_HOUSES, deckList } from './cards';
import { Action, GameState, PIdx, applyAction, createGame, validate } from './engine';
import { bestTakingPlay, decide, passThrowsMatch } from './bot';
import { DeckKnowledge } from './determinize';
import { decisionSeed, mulberry } from './rng';
import { BOTS, botDecide, hardPolicy } from './bots';
import { midMatchStates, noThrowStates, other } from './bot-fixtures';

function game(s: number): GameState {
  return createGame({ houses: [ALL_HOUSES[s % 4], ALL_HOUSES[(s + 1) % 4]], seed: s, first: (s % 2) as PIdx }).state;
}
const know = (g: GameState, me: PIdx): DeckKnowledge => ({ oppList: deckList(g.players[other(me)].house) });
const key = (a: Action) => JSON.stringify(a);

describe('Hard: production configuration', () => {
  it('c8: version mcts-1 at 160 iterations, topK 6, c 0.7', () => {
    expect(MCTS_VERSION).toBe('mcts-1');
    expect(HARD_ITERATIONS).toBe(160);
    expect(MCTS_DEFAULTS).toEqual({ iterations: 160, topK: 6, c: 0.7 });
  });

  it('there is one determinize, the shared one: bot-mcts no longer carries its own leaky copy or the unfair decideMcts', () => {
    const names = Object.keys(mcts);
    expect(names).not.toContain('determinize');
    expect(names).not.toContain('decideMcts');
    expect(names).toContain('searchMcts');
    expect(names).toContain('rootMoves');
  });
});

describe('Level 2 search', () => {
  it('always offers pass first and only legal root moves', () => {
    for (let s = 0; s < 8; s++) {
      const g = game(s);
      const moves = rootMoves(g, g.current, 6, mulberry(s));
      expect(moves[0]).toEqual({ type: 'pass' });
      for (const a of moves) expect(validate(g, g.current, a)).toBeNull();
    }
  });

  it('the shortlist is pass, the Medium pick and at most topK best plays, without duplicates', () => {
    for (const s of midMatchStates(40, 101000)) {
      for (const topK of [1, 3, 6]) {
        const moves = rootMoves(s.g, s.me, topK, mulberry(s.k));
        expect(moves.length, `match ${s.k} topK ${topK}`).toBeLessThanOrEqual(topK + 2);
        expect(new Set(moves.map(key)).size, 'no duplicates').toBe(moves.length);
        for (const a of moves) expect(validate(s.g, s.me, a), key(a)).toBeNull();
        const medium = decide(s.g, s.me, mulberry(s.k));
        if (medium.type === 'play' || !passThrowsMatch(s.g, s.me)) {
          expect(moves.map(key), 'Medium\'s own pick is always searched').toContain(key(medium));
        }
      }
    }
  });

  it('c5: the shortlist omits pass when passing would lose the match, and it still offers legal plays', () => {
    const states = noThrowStates(60, 102000, bestTakingPlay);
    for (const s of states) {
      expect(passThrowsMatch(s.g, s.me)).toBe(true);
      const moves = rootMoves(s.g, s.me, 6, mulberry(s.k));
      expect(moves.length).toBeGreaterThan(0);
      for (const a of moves) {
        expect(a.type, `match ${s.k} round ${s.g.round}`).toBe('play');
        expect(validate(s.g, s.me, a)).toBeNull();
      }
    }
  });

  it('the shortlist keeps pass whenever passing is not a match-losing move', () => {
    const keeps = midMatchStates(80, 103000).filter(s => !passThrowsMatch(s.g, s.me));
    expect(keeps.length).toBeGreaterThan(60);
    for (const s of keeps) expect(rootMoves(s.g, s.me, 6, mulberry(s.k))[0], `match ${s.k}`).toEqual({ type: 'pass' });
  });

  it('reports visit statistics that add up to the iteration budget', () => {
    const g = game(5);
    const { action, stats } = searchMcts(g, g.current, mulberry(9), know(g, g.current), { iterations: 30 });
    expect(stats.reduce((n, x) => n + x.visits, 0)).toBe(30);
    expect(validate(g, g.current, action)).toBeNull();
    for (const x of stats) {
      expect(x.mean).toBeGreaterThanOrEqual(0);
      expect(x.mean).toBeLessThanOrEqual(1);
    }
  });

  it('every shortlisted move is tried once before any is tried twice, and the most-tried move is played', () => {
    for (const s of midMatchStates(25, 104000)) {
      const moves = rootMoves(s.g, s.me, 6, mulberry(5));
      if (moves.length < 2) continue;
      const once = searchMcts(s.g, s.me, mulberry(5), know(s.g, s.me), { iterations: moves.length });
      expect(once.stats.map(x => x.visits), `match ${s.k}: one try each`).toEqual(moves.map(() => 1));
      const { action, stats } = searchMcts(s.g, s.me, mulberry(5), know(s.g, s.me), { iterations: 24 });
      expect(stats.reduce((n, x) => n + x.visits, 0)).toBe(24);
      const most = Math.max(...stats.map(x => x.visits));
      const chosen = stats.filter(x => key(x.action) === key(action));
      expect(chosen, 'the played move is one of the searched moves').toHaveLength(1);
      expect(chosen[0].visits, `match ${s.k}: the played move has the most visits`).toBe(most);
    }
  });

  it('the searched moves are the shortlist', () => {
    for (const s of midMatchStates(15, 105000)) {
      const moves = rootMoves(s.g, s.me, 6, mulberry(7));
      const { stats } = searchMcts(s.g, s.me, mulberry(7), know(s.g, s.me), { iterations: 12 });
      if (moves.length > 1) expect(stats.map(x => key(x.action)).sort(), `match ${s.k}`).toEqual(moves.map(key).sort());
    }
  });

  it('c5: searching a position where passing loses the match never tries a pass or plays one', () => {
    for (const s of noThrowStates(30, 106000, bestTakingPlay)) {
      const { action, stats } = searchMcts(s.g, s.me, mulberry(s.k), know(s.g, s.me), { iterations: 6 });
      expect(action.type, `match ${s.k}`).toBe('play');
      for (const x of stats) expect(x.action.type).toBe('play');
    }
  });

  it('an empty hand passes without searching', () => {
    const s = midMatchStates(5, 107000)[2];
    const g = structuredClone(s.g);
    g.players[s.me].hand = [];
    expect(searchMcts(g, s.me, mulberry(1), know(g, s.me), { iterations: 10 })).toEqual({ action: { type: 'pass' }, stats: [] });
  });

  it('is deterministic given the view, the stream and the knowledge, never reads Math.random, and leaves the view alone', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      for (const s of midMatchStates(10, 108000)) {
        const before = structuredClone(s.g);
        const a = searchMcts(s.g, s.me, mulberry(s.k), know(s.g, s.me), { iterations: 10 });
        const b = searchMcts(s.g, s.me, mulberry(s.k), know(s.g, s.me), { iterations: 10 });
        expect(b, `match ${s.k}`).toEqual(a);
        expect(s.g, 'the view is not mutated').toEqual(before);
      }
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('searches a custom deck too (only the house pool known) and plays a legal move', () => {
    for (const s of midMatchStates(12, 109000, true)) {
      const { action } = searchMcts(s.g, s.me, mulberry(s.k), { oppList: null }, { iterations: 8 });
      expect(validate(s.g, s.me, action), `match ${s.k}`).toBeNull();
    }
  });

  it('plays a full legal match against the Level 1 bot', { timeout: 60_000 }, () => {
    const g = game(6);
    const rnd = mulberry(6);
    const hard = hardPolicy({ iterations: 12 });
    for (let i = 0; i < 400 && !g.over; i++) {
      const p = g.current;
      const a: Action = p === 0
        ? botDecide(hard, g, p, { rnd: mulberry(decisionSeed(6, g.turnNo)), know: know(g, p) }).action
        : decide(g, p, rnd);
      const r = applyAction(g, p, a);
      expect('error' in r ? r.error : null).toBeNull();
    }
    expect(g.over).toBe(true);
  });

  it('a full match with Hard on both seats and Medium-vs-Hard harness runs end to end without an illegal move', { timeout: 60_000 }, () => {
    const g = game(11);
    const hard = hardPolicy({ iterations: 6 });
    for (let i = 0; i < 400 && !g.over; i++) {
      const p = g.current;
      const policy = p === 0 ? hard : BOTS.medium;
      const a = botDecide(policy, g, p, { rnd: mulberry(decisionSeed(p + 1, g.turnNo)), know: know(g, p) }).action;
      const r = applyAction(g, p, a);
      expect('error' in r ? r.error : null).toBeNull();
    }
    expect(g.over).toBe(true);
  });
});
