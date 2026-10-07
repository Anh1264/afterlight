import { describe, expect, it } from 'vitest';
import { CARDS, RULES } from './cards';
import type { PIdx, Unit } from './engine';
import { totals } from './engine';
import { passMatch, passPromise, type RoundBoard } from './pass';

/** A unit built from a real card id; power comes from the card, so boards stay tied to real data. */
function unit(cardId: string, owner: PIdx, uid: string): Unit {
  const d = CARDS[cardId];
  const power = d.power ?? 0;
  return {
    uid, cardId, name: d.name, owner, house: d.house, power, base: power, row: d.rows === 'B' ? 'B' : 'F',
    grow: false, guard: false, shield: false, poison: false, token: false, silenced: false,
  };
}

function board(o: { round: number; first: PIdx; mine: string[]; theirs: string[]; me: PIdx; theyPassed: boolean; wins?: [number, number] }): RoundBoard {
  const op: PIdx = o.me === 0 ? 1 : 0;
  const mk = (ids: string[], owner: PIdx) => ids.map((id, i) => unit(id, owner, `${owner}-${i}`));
  const [mw, ow] = o.wins ?? [0, 0];
  const players: RoundBoard['players'] = [{ units: [], passed: false, wins: 0 }, { units: [], passed: false, wins: 0 }];
  players[o.me] = { units: mk(o.mine, o.me), passed: false, wins: mw };
  players[op] = { units: mk(o.theirs, op), passed: o.theyPassed, wins: ow };
  return { round: o.round, first: o.first, players };
}

describe('passPromise (c1: what the pass button promises)', () => {
  it('Round 1, opponent went first and passed, my units total exactly First Light more: tie', () => {
    // squire 4 vs thornling 2 + First Light on the opponent
    const b = board({ round: 1, first: 1, me: 0, mine: ['squire'], theirs: ['thornling'], theyPassed: true });
    const t = totals({ players: b.players, round: b.round, first: b.first });
    expect(t[0] - t[1], 'sanity: board really is level under totals()').toBe(0);
    expect(RULES.FIRST_LIGHT).toBe(2); // the board above is built for First Light +2
    expect(passPromise(b, 0)).toBe('tie');
  });

  it('Round 1, I went first, opponent passed, my units total 1 less: win (First Light goes to me)', () => {
    // squire 4 (+2 First Light) vs static-runner 5
    const b = board({ round: 1, first: 0, me: 0, mine: ['squire'], theirs: ['static-runner'], theyPassed: true });
    const t = totals({ players: b.players, round: b.round, first: b.first });
    expect(t[0] - t[1], 'sanity: I lead by 1 under totals()').toBe(1);
    expect(passPromise(b, 0)).toBe('win');
  });

  it('Round 1, I went first, opponent passed, I am behind even with First Light: lose', () => {
    // squire 4 (+2) = 6 vs vorok 6 + thornling 2 = 8
    const b = board({ round: 1, first: 0, me: 0, mine: ['squire'], theirs: ['vorok', 'thornling'], theyPassed: true });
    expect(passPromise(b, 0)).toBe('lose');
  });

  it('works from seat 1 as well (me = 1, opponent went first)', () => {
    const b = board({ round: 1, first: 0, me: 1, mine: ['squire'], theirs: ['thornling'], theyPassed: true });
    expect(passPromise(b, 1)).toBe('tie');
  });

  it('Round 2 has no First Light: equal units tie even for the player who went first', () => {
    const b = board({ round: 2, first: 0, me: 0, mine: ['squire'], theirs: ['squire'], theyPassed: true });
    expect(passPromise(b, 0)).toBe('tie');
  });

  it('is null while the opponent is still playing', () => {
    const b = board({ round: 1, first: 0, me: 0, mine: ['squire'], theirs: ['thornling'], theyPassed: false });
    expect(passPromise(b, 0)).toBeNull();
  });
});

describe('passMatch (c1 extended: the pass button names a match result)', () => {
  const level = { me: 0 as PIdx, mine: ['squire'], theirs: ['squire'] };

  it('0-1 down in Round 2, opponent passed, totals tied: lose (a tied round gives both a win)', () => {
    const b = board({ ...level, round: 2, first: 0, wins: [0, 1], theyPassed: true });
    expect(passPromise(b, 0)).toBe('tie');
    expect(passMatch(b, 0)).toBe('lose');
  });

  it('1-0 up in Round 2, opponent passed, I am ahead: win', () => {
    const b = board({ me: 0, mine: ['squire'], theirs: ['thornling'], round: 2, first: 0, wins: [1, 0], theyPassed: true });
    expect(passMatch(b, 0)).toBe('win');
  });

  it('1-1 in the last round, tied: draw (the round cap ends the match)', () => {
    const b = board({ ...level, round: RULES.ROUNDS, first: 0, wins: [1, 1], theyPassed: true });
    expect(passMatch(b, 0)).toBe('draw');
  });

  it('0-0 in Round 1: the match goes on (null)', () => {
    const b = board({ ...level, round: 1, first: 0, wins: [0, 0], theyPassed: true });
    expect(passMatch(b, 0)).toBeNull();
  });

  it('is null while the opponent is still playing', () => {
    const b = board({ ...level, round: 2, first: 0, wins: [0, 1], theyPassed: false });
    expect(passMatch(b, 0)).toBeNull();
  });

  it('works from seat 1', () => {
    const b = board({ me: 1, mine: ['squire'], theirs: ['squire'], round: 2, first: 0, wins: [0, 1], theyPassed: true });
    expect(passMatch(b, 1)).toBe('lose');
  });
});
