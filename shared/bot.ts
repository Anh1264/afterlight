// Heuristic bot, ported from the balance simulator and extended to pick targets.
import { CARDS } from './cards';
import {
  Action, GameState, PIdx, Row, TargetSpec, Unit, activeEffect, clone, doPlay, endTurn,
  legalRows, score, targetSpecFor, totals, validate,
} from './engine';

type Play = Extract<Action, { type: 'play' }>;

function evaluate(g: GameState, me: PIdx): number {
  const p = g.players[me], o = g.players[me === 0 ? 1 : 0];
  const turnsLeft = o.passed ? 0 : Math.min(p.hand.length, o.hand.length);
  const k = turnsLeft * 0.8;
  let v = score(p) - score(o);
  // a card in hand is a future play; values Draw effects (every candidate play spends one card equally)
  v += 4 * (p.hand.length - o.hand.length);
  const val = (u: Unit, sign: number) => {
    let x = 0;
    if (u.grow) x += k;
    if (u.poison) x -= Math.min(u.power, k);
    if (u.shield) x += 0.6;
    return sign * x;
  };
  for (const u of p.units) v += val(u, 1);
  for (const u of o.units) v += val(u, -1);
  return v;
}

function combos<T>(pool: T[], min: number, max: number, cap = 40): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (out.length >= cap) return;
    if (cur.length >= min) out.push(cur.slice());
    if (cur.length === max) return;
    for (let i = start; i < pool.length; i++) { cur.push(pool[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

function expand(base: Play, spec: TargetSpec): Play[] {
  switch (spec.kind) {
    case 'none': return [base];
    case 'units': return combos(spec.pool, spec.min, spec.max).map(t => ({ ...base, targets: t }));
    case 'row': return (['F', 'B'] as Row[]).map(r => ({ ...base, targetRow: r }));
    case 'mode': return spec.options.flatMap((o, i) => expand({ ...base, mode: i }, o.spec));
  }
}

export function candidatePlays(g: GameState, me: PIdx): Play[] {
  const p = g.players[me], opp = g.players[me === 0 ? 1 : 0];
  const seen = new Set<string>();
  const out: Play[] = [];
  for (const c of p.hand) {
    if (seen.has(c.cardId)) continue;
    seen.add(c.cardId);
    const def = CARDS[c.cardId];
    const { eff } = activeEffect(def, opp.passed);
    const rows: (Row | undefined)[] = def.kind === 'unit' ? legalRows(g, me, def) : [undefined];
    for (const row of rows) {
      // targets are chosen against the board as it will be once the unit lands (same as the engine)
      out.push(...expand({ type: 'play', uid: c.uid, row }, targetSpecFor(g, me, eff)));
    }
  }
  return out;
}

export function bestPlay(g: GameState, me: PIdx): { v: number; play: Play } | null {
  const base = evaluate(g, me);
  const oppPassed = g.players[me === 0 ? 1 : 0].passed;
  let best: { v: number; play: Play } | null = null;
  for (const play of candidatePlays(g, me)) {
    const g2 = clone(g);
    try { doPlay(g2, me, play, []); endTurn(g2, me, []); } catch { continue; }
    let v = evaluate(g2, me) - base;
    const def = CARDS[g.players[me].hand.find(c => c.uid === play.uid)!.cardId];
    if (def.resolve && !oppPassed) v -= 2.5; // hold Resolve cards for after a pass
    if (def.tier === 'LEGEND' && g.round === 1) v -= 1.0;
    if (!best || v > best.v) best = { v, play };
  }
  return best;
}

const other = (p: PIdx): PIdx => (p === 0 ? 1 : 0);

export const R1_TAKE = { MAX_OPP_CARDS_ON_BOARD: 1, MAX_CARDS: 2, CARD_SLACK: 1 } as const;

function lead(g: GameState, me: PIdx): number {
  const t = totals(g);
  return t[me] - t[other(me)];
}

/** Best single legal play after which `me` is strictly ahead on totals(): smallest winning margin first,
 *  non-Legends before Legends, then candidatePlays order. */
export function bestTakingPlay(g: GameState, me: PIdx): Play | null {
  let best: { play: Play; margin: number; legend: boolean } | null = null;
  for (const play of candidatePlays(g, me)) {
    if (validate(g, me, play) !== null) continue;
    const inst = g.players[me].hand.find(c => c.uid === play.uid);
    if (!inst) continue;
    const g2 = clone(g);
    doPlay(g2, me, play, []);
    endTurn(g2, me, []);
    const margin = lead(g2, me);
    if (margin <= 0) continue;
    const legend = CARDS[inst.cardId].tier === 'LEGEND';
    if (!best || margin < best.margin || (margin === best.margin && best.legend && !legend)) {
      best = { play, margin, legend };
    }
  }
  return best ? best.play : null;
}

/** Opponent has passed: cards `me` needs to get strictly ahead. 1 if bestTakingPlay exists, else greedy bestPlay steps up to max. */
export function takeRoundCost(g: GameState, me: PIdx, max: number): { cards: number; first: Play } | null {
  const one = bestTakingPlay(g, me);
  if (one) return { cards: 1, first: one };
  const cur = clone(g);
  let first: Play | null = null;
  for (let cards = 1; cards <= max; cards++) {
    const bm = bestPlay(cur, me);
    if (!bm || validate(cur, me, bm.play) !== null) return null;
    if (!first) first = bm.play;
    doPlay(cur, me, bm.play, []);
    endTurn(cur, me, []);
    if (lead(cur, me) > 0) return { cards, first };
  }
  return null;
}

export function decide(g: GameState, me: PIdx, rnd: () => number = Math.random): Action {
  const p = g.players[me], o = g.players[other(me)];
  if (!p.hand.length) return { type: 'pass' };
  const diff = lead(g, me);
  const r = g.round;
  const mustWin = o.wins === 1;
  const bm = bestPlay(g, me);
  if (!bm) return { type: 'pass' };
  const play: Action = bm.play;
  if (o.passed) {
    if (diff > 0) return { type: 'pass' };
    if (r === 3 || mustWin) return play;
    if (r === 1 && o.units.filter(u => !u.token).length <= R1_TAKE.MAX_OPP_CARDS_ON_BOARD) {
      const c = takeRoundCost(g, me, R1_TAKE.MAX_CARDS);
      if (c && p.hand.length - c.cards >= o.hand.length - R1_TAKE.CARD_SLACK) return c.first;
    }
    if (diff + bm.v > 0 && p.hand.length - 1 >= o.hand.length) return play;
    if (diff + bm.v > 0 && r === 1 && rnd() < 0.5) return play;
    return { type: 'pass' };
  }
  if (r === 3 || mustWin) {
    if (diff > 0 && !o.hand.length) return { type: 'pass' };
    return play;
  }
  if (p.wins === 1 && o.wins === 0) return { type: 'pass' }; // dry pass after winning a round
  const playedThisRound = p.units.filter(u => !u.token).length;
  if (diff > 0 && playedThisRound >= 2 && p.hand.length <= o.hand.length && rnd() < 0.8) return { type: 'pass' };
  if (diff < -9 && p.hand.length <= o.hand.length + 1 && playedThisRound >= 2) return { type: 'pass' };
  if (p.hand.length <= 5 && diff >= 0) return { type: 'pass' };
  return play;
}
