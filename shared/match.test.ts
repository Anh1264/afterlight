import { describe, expect, it } from 'vitest';
import { RULES } from './cards';
import { matchWinner } from './engine';

describe('matchWinner (c1 extended: one place for the match-end rule)', () => {
  const W = RULES.WINS_NEEDED;
  const last = RULES.ROUNDS;
  it('first to WINS_NEEDED wins', () => {
    expect(matchWinner([W, 0], 2)).toBe(0);
    expect(matchWinner([0, W], 2)).toBe(1);
  });
  it('a tied round gives both a win: both at WINS_NEEDED is a draw', () => {
    expect(matchWinner([W, W], 2)).toBe('draw');
  });
  it('the match goes on while nobody has enough wins before the last round', () => {
    expect(matchWinner([1, 1], 2)).toBeNull();
    expect(matchWinner([1, 0], 1)).toBeNull();
  });
  it('the last round ends the match: more wins takes it, level is a draw', () => {
    expect(matchWinner([1, W], last)).toBe(1);
    expect(matchWinner([W, W], last)).toBe('draw');
    expect(matchWinner([1, 1], last)).toBe('draw');
  });
});
