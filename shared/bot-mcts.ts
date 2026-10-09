// Hard: determinized Monte Carlo search (PIMC) with a UCB1 bandit over root moves, run on the fair view.
//
// The bot never searches the real state: the harness (bots.ts botDecide) hands it a view built by the shared
// determinize, and every iteration here re-determinizes that view. Each iteration:
//   1. determinizes: builds one plausible world consistent with what the bot may know
//      (opponent hand + deck redealt from the cards it could hold, own deck reshuffled, engine RNG reseeded);
//   2. picks a root move with UCB1 (try the most promising move, but keep exploring the others);
//   3. plays that move, then rolls the match out to the end with Medium (bot.ts decide) playing both seats;
//   4. scores the result (win 1, draw 0.5, loss 0) and credits it to that root move.
// The move with the most visits is played. Averaging over many sampled worlds is what lets it reason about
// hidden cards and, above all, about when to pass.
//
// Known limitation (strategy fusion): every rollout sees one fully revealed world, so the bot assumes it
// will "know" the hidden cards later in the line. The larger limit is that Medium plays both sides of every
// imagined future. See docs/specs/bot-levels.md "Strategy fusion, and Hard's real limit".
import { CARDS } from './cards';
import { Action, GameState, PIdx, applyAction, clone, doPlay, endTurn, validate } from './engine';
import { candidatePlays, decide, evaluate, passThrowsMatch } from './bot';
import { DeckKnowledge, determinize } from './determinize';

export interface MctsOptions {
  /** Rollouts per decision. Cost is roughly linear: ~5-8 ms per rollout on a laptop core. */
  iterations: number;
  /** Root plays kept after one-ply pruning (Medium's pick is always kept; so is pass, unless passing would throw the match). */
  topK: number;
  /** UCB1 exploration constant; rewards are in [0, 1]. */
  c: number;
}

/** Hard's algorithm version: bump whenever its golden decisions change (shared/__golden__/bot-levels.json). */
export const MCTS_VERSION = 'mcts-1';

/** Applied default 4: the largest of 80/160/320 within 1.5 s p95 on a laptop core; BL-2 re-measures on Railway. */
export const HARD_ITERATIONS = 160;

export const MCTS_DEFAULTS: MctsOptions = { iterations: HARD_ITERATIONS, topK: 6, c: 0.7 };

const key = (a: Action) => JSON.stringify(a);

/**
 * Root moves worth searching, on the view: pass, Medium's pick and the best `topK` plays by one-ply evaluation.
 * Pass is omitted when passing would end the match with `me` losing (passThrowsMatch), so Hard never throws a match.
 */
export function rootMoves(view: GameState, me: PIdx, topK: number, rnd: () => number): Action[] {
  const base = evaluate(view, me);
  const scored: { a: Action; v: number }[] = [];
  for (const play of candidatePlays(view, me)) {
    if (validate(view, me, play) !== null) continue;
    const g2 = clone(view);
    doPlay(g2, me, play, []);
    endTurn(g2, me, []);
    scored.push({ a: play, v: evaluate(g2, me) - base });
  }
  scored.sort((x, y) => y.v - x.v);
  const noPass = passThrowsMatch(view, me);
  const out: Action[] = [];
  const seen = new Set<string>();
  const add = (a: Action) => {
    if (a.type === 'pass' && noPass) return;
    const k = key(a);
    if (!seen.has(k)) { seen.add(k); out.push(a); }
  };
  add({ type: 'pass' });
  add(decide(view, me, rnd));
  for (const s of scored.slice(0, topK)) add(s.a);
  return out;
}

/** Plays a determinized state to the end with Medium on both seats; returns `me`'s reward. */
function rollout(s: GameState, me: PIdx, rnd: () => number): number {
  for (let i = 0; i < 400 && !s.over; i++) {
    const p = s.current;
    const r = applyAction(s, p, decide(s, p, rnd));
    if ('error' in r) throw new Error('rollout: illegal greedy action: ' + r.error);
  }
  if (!s.over) throw new Error('rollout: match did not finish');
  return s.winner === me ? 1 : s.winner === 'draw' ? 0.5 : 0;
}

export interface MctsStats { action: Action; visits: number; mean: number }

/**
 * Hard's decision on the fair view: the chosen action plus per-move statistics (useful for debugging and teaching).
 * `view` is already fair (bots.ts botDecide builds it); every iteration redeals the hidden cards with determinize(view, me, rnd, know).
 * All randomness comes from `rnd`.
 */
export function searchMcts(
  view: GameState, me: PIdx, rnd: () => number, know: DeckKnowledge, opts: Partial<MctsOptions> = {},
): { action: Action; stats: MctsStats[] } {
  const o: MctsOptions = { ...MCTS_DEFAULTS, ...opts };
  if (!view.players[me].hand.length) return { action: { type: 'pass' }, stats: [] };
  const moves = rootMoves(view, me, o.topK, rnd);
  if (moves.length === 1) return { action: moves[0], stats: [{ action: moves[0], visits: 0, mean: 0 }] };
  const n = moves.map(() => 0), w = moves.map(() => 0);
  for (let it = 0; it < o.iterations; it++) {
    // UCB1: unvisited moves first, then mean + c * sqrt(ln N / n_i)
    let pick = n.findIndex(x => x === 0);
    if (pick < 0) {
      let best = -Infinity;
      const lnN = Math.log(it);
      for (let i = 0; i < moves.length; i++) {
        const u = w[i] / n[i] + o.c * Math.sqrt(lnN / n[i]);
        if (u > best) { best = u; pick = i; }
      }
    }
    const s = determinize(view, me, rnd, know);
    const r = applyAction(s, me, moves[pick]);
    if ('error' in r) throw new Error('searchMcts: illegal root move: ' + r.error);
    w[pick] += rollout(s, me, rnd);
    n[pick]++;
  }
  const stats = moves.map((action, i) => ({ action, visits: n[i], mean: n[i] ? w[i] / n[i] : 0 }));
  let bi = 0;
  for (let i = 1; i < stats.length; i++) {
    if (stats[i].visits > stats[bi].visits || (stats[i].visits === stats[bi].visits && stats[i].mean > stats[bi].mean)) bi = i;
  }
  return { action: stats[bi].action, stats };
}

/** Human-readable label for an action, for logs and the head-to-head report. */
export function describe(g: GameState, me: PIdx, a: Action): string {
  if (a.type === 'pass') return 'pass';
  const inst = g.players[me].hand.find(c => c.uid === a.uid);
  const name = inst ? CARDS[inst.cardId].name : a.uid;
  return `${name}${a.row ? ' @' + a.row : ''}${a.targets?.length ? ' -> ' + a.targets.length + ' target(s)' : ''}${a.mode !== undefined ? ' mode ' + a.mode : ''}`;
}
