// Bot difficulty levels. No imports on purpose: the client and the protocol can use this without pulling in the bots.
// Design: docs/specs/bot-levels.md section 3.

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'];

/** Open decision 1, applied default: the bot the demo was tuned and tested against. */
export const DEFAULT_LEVEL: Level = 'medium';

export const LEVEL_INFO: Readonly<Record<Level, { label: string; blurb: string }>> = {
  easy: { label: 'Easy', blurb: 'Learning the game' },
  medium: { label: 'Medium', blurb: 'Plays solid moves' },
  hard: { label: 'Hard', blurb: 'Plans ahead and passes well' },
};

export function isLevel(x: unknown): x is Level {
  return typeof x === 'string' && LEVELS.some(l => l === x);
}
