// Level 2 bot: determinized Monte Carlo search (PIMC) with a UCB1 bandit over root moves.
//
// The bot cannot see the opponent's hand or either deck order, so it never searches the real state.
// Each iteration it:
//   1. determinizes: builds one plausible world consistent with what it can see
//      (opponent hand + deck reshuffled together and re-dealt, own deck reshuffled, engine RNG reseeded);
//   2. picks a root move with UCB1 (try the most promising move, but keep exploring the others);
//   3. plays that move, then rolls the match out to the end with the Level 1 greedy bot playing both seats;
//   4. scores the result (win 1, draw 0.5, loss 0) and credits it to that root move.
// The move with the most visits is played. Averaging over many sampled worlds is what lets it reason about
// hidden cards and, above all, about when to pass.
//
// Known limitation (strategy fusion): every rollout sees one fully revealed world, so the bot assumes it
// will "know" the hidden cards later in the line. ISMCTS is the fix if this ever shows up in play.
import { CARDS } from './cards';
import { Action, GameState, PIdx, applyAction, clone, doPlay, endTurn, validate } from './engine';
import { candidatePlays, decide, evaluate } from './bot';

export interface MctsOptions {
  /** Rollouts per decision. Cost is roughly linear: ~5-8 ms per rollout on a laptop core. */
  iterations: number;
  /** Root plays kept after one-ply pruning (pass and the greedy pick are always kept). */
  topK: number;
  /** UCB1 exploration constant; rewards are in [0, 1]. */
  c: number;
}

export const MCTS_DEFAULTS: MctsOptions = { iterations: 160, topK: 6, c: 0.7 };

const other = (p: PIdx): PIdx => (p === 0 ? 1 : 0);

function shuffleWith<T>(a: T[], rnd: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One plausible full state given only what `me` can see. Never reads the hidden order it replaces. */
export function determinize(g: GameState, me: PIdx, rnd: () => number): GameState {
  const s = clone(g);
  const o = s.players[other(me)];
  const pool = shuffleWith([...o.hand, ...o.deck], rnd);
  o.hand = pool.slice(0, o.hand.length);
  o.deck = pool.slice(o.hand.length);
  shuffleWith(s.players[me].deck, rnd);
  s.rng = Math.floor(rnd() * 2 ** 32) >>> 0;
  return s;
}

const key = (a: Action) => JSON.stringify(a);

/** Root moves worth searching: pass, the greedy pick, and the best `topK` plays by one-ply evaluation. */
export function rootMoves(g: GameState, me: PIdx, topK: number, rnd: () => number): Action[] {
  const base = evaluate(g, me);
  const scored: { a: Action; v: number }[] = [];
  for (const play of candidatePlays(g, me)) {
    if (validate(g, me, play) !== null) continue;
    const g2 = clone(g);
    doPlay(g2, me, play, []);
    endTurn(g2, me, []);
    scored.push({ a: play, v: evaluate(g2, me) - base });
  }
  scored.sort((x, y) => y.v - x.v);
  const out: Action[] = [{ type: 'pass' }];
  const seen = new Set(out.map(key));
  const add = (a: Action) => { const k = key(a); if (!seen.has(k)) { seen.add(k); out.push(a); } };
  add(decide(g, me, rnd));
  for (const s of scored.slice(0, topK)) add(s.a);
  return out;
}

/** Plays a determinized state to the end with the greedy bot on both seats; returns `me`'s reward. */
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

/** Level 2 decision. Returns the chosen action plus per-move statistics (useful for debugging and teaching). */
export function searchMcts(
  g: GameState, me: PIdx, rnd: () => number = Math.random, opts: Partial<MctsOptions> = {},
): { action: Action; stats: MctsStats[] } {
  const o: MctsOptions = { ...MCTS_DEFAULTS, ...opts };
  if (!g.players[me].hand.length) return { action: { type: 'pass' }, stats: [] };
  const moves = rootMoves(g, me, o.topK, rnd);
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
    const s = determinize(g, me, rnd);
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

export function decideMcts(g: GameState, me: PIdx, rnd: () => number = Math.random, opts: Partial<MctsOptions> = {}): Action {
  return searchMcts(g, me, rnd, opts).action;
}

/** Human-readable label for an action, for logs and the head-to-head report. */
export function describe(g: GameState, me: PIdx, a: Action): string {
  if (a.type === 'pass') return 'pass';
  const inst = g.players[me].hand.find(c => c.uid === a.uid);
  const name = inst ? CARDS[inst.cardId].name : a.uid;
  return `${name}${a.row ? ' @' + a.row : ''}${a.targets?.length ? ' -> ' + a.targets.length + ' target(s)' : ''}${a.mode !== undefined ? ' mode ' + a.mode : ''}`;
}
