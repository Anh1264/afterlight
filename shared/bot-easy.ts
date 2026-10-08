// Easy, the eager beginner: Medium's move scorer without Medium's discipline.
//   1. No pass planning: it passes only when it is ahead (always once the opponent has passed, otherwise on a chance).
//      It never dry-passes and never counts cards, so it overspends early and runs dry in Round 3.
//   2. An occasional near-miss: it sometimes plays its 2nd or 3rd best card instead of the best, but only one that
//      scores close to the best, so it never wastes a Legend for nothing.
// It never passes while behind once the opponent has passed, so it never gives a match away. Pure: all randomness is `rnd`.
// Design: docs/specs/bot-levels.md "Easy, the eager beginner".
import { Action, GameState, PIdx } from './engine';
import { Play, ScoredPlay, lead, rankedPlays } from './bot';

export interface EasyKnobs {
  /** chance to pass on a turn it is ahead while the opponent is still playing */
  aheadPassP: number;
  /** chance to consider a near-miss instead of the best play */
  mistakeP: number;
  /** near-misses are the 2nd..(1+mistakeDepth)th best distinct cards */
  mistakeDepth: number;
  /** ...and only if they score within `slack` of the best */
  slack: number;
}

/** Retuning any value changes Easy's decisions: bump its version in bots.ts and re-record the golden. */
export const EASY_KNOBS: EasyKnobs = { aheadPassP: 0.25, mistakeP: 0.2, mistakeDepth: 2, slack: 4 };

const PASS: Action = { type: 'pass' };

/** Each card's best entry of `ranked` (which is best first), in rank order. Two rows of one card are not two choices. */
function bestPerCard(view: GameState, me: PIdx, ranked: readonly ScoredPlay[]): ScoredPlay[] {
  const hand = view.players[me].hand;
  const seen = new Set<string>();
  const out: ScoredPlay[] = [];
  for (const r of ranked) {
    const inst = hand.find(c => c.uid === r.play.uid);
    if (!inst || seen.has(inst.cardId)) continue;
    seen.add(inst.cardId);
    out.push(r);
  }
  return out;
}

export function decideEasy(view: GameState, me: PIdx, rnd: () => number, k: EasyKnobs = EASY_KNOBS): Action {
  if (view.players[me].hand.length === 0) return PASS;
  const ranked = rankedPlays(view, me);
  if (ranked.length === 0) return PASS;
  const best = ranked[0];
  const diff = lead(view, me);
  const oppPassed = view.players[me === 0 ? 1 : 0].passed;

  // the opponent has passed: take the round if there is a play for it, keep the cards if it is already won
  if (oppPassed) return diff > 0 ? PASS : best.play;

  if (diff > 0 && rnd() < k.aheadPassP) return PASS;

  if (rnd() < k.mistakeP) {
    const near: Play[] = bestPerCard(view, me, ranked)
      .slice(1, 1 + k.mistakeDepth)
      .filter(r => r.v >= best.v - k.slack)
      .map(r => r.play);
    if (near.length > 0) return near[Math.floor(rnd() * near.length)];
  }
  return best.play;
}
