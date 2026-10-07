import { matchWinner, totals, type PIdx, type Unit } from './engine';

export type PassOutcome = 'win' | 'tie' | 'lose';

/** The slice of a PlayerView that decides what passing does. No hidden information. */
export interface RoundBoard {
  round: number;
  first: PIdx;
  players: [{ units: Unit[]; passed: boolean; wins: number }, { units: Unit[]; passed: boolean; wins: number }];
}

/** What passing now does to the round when the opponent has already passed; null while they are still playing. Uses totals(). */
export function passPromise(b: RoundBoard, me: PIdx): PassOutcome | null {
  const op: PIdx = me === 0 ? 1 : 0;
  if (!b.players[op].passed) return null;
  const t = totals(b);
  return t[me] > t[op] ? 'win' : t[me] === t[op] ? 'tie' : 'lose';
}

/** If passing now ends the whole match, its result for me; null while the opponent is still playing or the match goes on. */
export function passMatch(b: RoundBoard, me: PIdx): 'win' | 'lose' | 'draw' | null {
  const outcome = passPromise(b, me);
  if (!outcome) return null;
  const op: PIdx = me === 0 ? 1 : 0;
  const wins: [number, number] = [b.players[0].wins, b.players[1].wins];
  if (outcome !== 'lose') wins[me]++;
  if (outcome !== 'win') wins[op]++;
  const w = matchWinner(wins, b.round);
  return w === null ? null : w === 'draw' ? 'draw' : w === me ? 'win' : 'lose';
}
