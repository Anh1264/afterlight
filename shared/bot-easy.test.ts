// BL-1: Easy (decideEasy) and the shared/bot.ts additions it is built on (rankedPlays, lead, legalActions, passThrowsMatch).
// Covers c5 at policy level (Easy never gives up a match it could take) and the c3 floor's mechanism (Easy plays like
// Medium's move scorer, with naive passing and an occasional near-miss). The ladder numbers themselves come from
// `npm run ladder`, not from here. Design: docs/specs/bot-levels.md "Easy, the eager beginner" and section 3.
import { describe, expect, it, vi } from 'vitest';
import { CARDS } from './cards';
import { CardInst, GameState, PIdx, Row, Unit, clone, createGame, doPlay, endTurn, totals, validate } from './engine';
import {
  Play, ScoredPlay, bestPlay, bestTakingPlay, candidatePlays, decide, evaluate, lead, legalActions, passThrowsMatch, rankedPlays,
} from './bot';
import { EASY_KNOBS, EasyKnobs, decideEasy } from './bot-easy';
import { mulberry } from './rng';
import { Sample, midMatchStates, must, noThrowStates, oppPassedStates, other, passLosesMatch } from './bot-fixtures';

const PASS = { type: 'pass' } as const;
const knobs = (o: Partial<EasyKnobs>): EasyKnobs => ({ ...EASY_KNOBS, ...o });
const always = (x: number) => () => x;
const cardOf = (g: GameState, me: PIdx, play: Play): string => must(g.players[me].hand.find(c => c.uid === play.uid), `uid ${play.uid} in hand`).cardId;

/** The oracle for Easy's near-miss set: each card's best entry, the 2nd..(1+depth)th of those, within `slack` of the best. */
function nearMisses(g: GameState, me: PIdx, k: EasyKnobs): Play[] {
  const ranked = rankedPlays(g, me);
  if (!ranked.length) return [];
  const seen = new Set<string>();
  const perCard: ScoredPlay[] = [];
  for (const r of ranked) {
    const id = cardOf(g, me, r.play);
    if (!seen.has(id)) { seen.add(id); perCard.push(r); }
  }
  return perCard.slice(1, 1 + k.mistakeDepth).filter(r => r.v >= ranked[0].v - k.slack).map(r => r.play);
}

const MID = midMatchStates(160, 97000);                         // opponent mostly still playing
const PASSED = oppPassedStates(200, 98000);                     // opponent has passed, any round, bot ahead or behind
const diffOf = (s: Sample) => lead(s.g, s.me);
const hasPlay = (s: Sample) => rankedPlays(s.g, s.me).length > 0;

describe('Easy: decideEasy', () => {
  it('the knobs are the designed ones (a retune must bump easy:heur-easy-1)', () => {
    expect(EASY_KNOBS).toEqual({ aheadPassP: 0.25, mistakeP: 0.2, mistakeDepth: 2, slack: 4 });
  });

  it('an empty hand passes', () => {
    for (const s of MID.slice(0, 30)) {
      const g = clone(s.g);
      g.players[s.me].hand = [];
      expect(decideEasy(g, s.me, always(0.5))).toEqual(PASS);
    }
  });

  it('c5: when the opponent has passed and Easy is not ahead it plays its best play, whatever the dice say', () => {
    const behind = PASSED.filter(s => diffOf(s) <= 0 && hasPlay(s));
    expect(behind.length).toBeGreaterThan(80);
    const rnds: (() => number)[] = [always(0), always(0.19), always(0.5), always(0.999), mulberry(1), mulberry(2)];
    for (const s of behind) {
      const best = must(rankedPlays(s.g, s.me)[0], 'a play').play;
      for (const rnd of rnds) {
        expect(decideEasy(s.g, s.me, rnd), `round ${s.g.round}, lead ${diffOf(s)}, match ${s.k}`).toEqual(best);
      }
      expect(decideEasy(s.g, s.me, always(0), knobs({ aheadPassP: 1, mistakeP: 1 })), 'even with every chance set to certain').toEqual(best);
    }
  });

  it('when the opponent has passed and Easy is strictly ahead it passes and keeps its cards, whatever the dice say', () => {
    const ahead = PASSED.filter(s => diffOf(s) > 0);
    expect(ahead.length).toBeGreaterThan(30);
    for (const s of ahead) {
      for (const rnd of [always(0), always(0.5), always(0.999), mulberry(s.k)]) expect(decideEasy(s.g, s.me, rnd)).toEqual(PASS);
      expect(decideEasy(s.g, s.me, always(0.999), knobs({ aheadPassP: 0, mistakeP: 0 }))).toEqual(PASS);
    }
  });

  it('while the opponent is still playing and Easy is ahead, it passes when the dice fall under aheadPassP and plays its best otherwise', () => {
    const ahead = MID.filter(s => !s.g.players[other(s.me)].passed && diffOf(s) > 0 && hasPlay(s));
    expect(ahead.length).toBeGreaterThan(20);
    const k0 = knobs({ aheadPassP: 0.25, mistakeP: 0 });
    for (const s of ahead) {
      const best = must(rankedPlays(s.g, s.me)[0], 'a play').play;
      expect(decideEasy(s.g, s.me, always(0.1), k0), 'dice 0.1 < 0.25').toEqual(PASS);
      expect(decideEasy(s.g, s.me, always(0.9), k0), 'dice 0.9 >= 0.25').toEqual(best);
      expect(decideEasy(s.g, s.me, always(0.999), knobs({ aheadPassP: 1, mistakeP: 0 })), 'aheadPassP 1 always passes when ahead').toEqual(PASS);
      expect(decideEasy(s.g, s.me, always(0), knobs({ aheadPassP: 0, mistakeP: 0 })), 'aheadPassP 0 never passes').toEqual(best);
    }
  });

  it('while the opponent is still playing and Easy is not ahead it never passes: no dry passes, no giving up (even if told to pass whenever ahead)', () => {
    const notAhead = MID.filter(s => !s.g.players[other(s.me)].passed && diffOf(s) <= 0 && hasPlay(s));
    expect(notAhead.length).toBeGreaterThan(40);
    for (const s of notAhead) {
      const best = must(rankedPlays(s.g, s.me)[0], 'a play').play;
      expect(decideEasy(s.g, s.me, always(0), knobs({ aheadPassP: 1, mistakeP: 0 }))).toEqual(best);
      for (let seed = 0; seed < 30; seed++) expect(decideEasy(s.g, s.me, mulberry(seed)).type, `match ${s.k} seed ${seed}`).toBe('play');
    }
  });

  it('with aheadPassP = 0 and mistakeP = 0 Easy is exactly the best play (or the forced pass): the whole decision table', () => {
    const k0 = knobs({ aheadPassP: 0, mistakeP: 0 });
    for (const s of [...MID.slice(0, 100), ...PASSED.slice(0, 120)]) {
      const ranked = rankedPlays(s.g, s.me);
      const oppPassed = s.g.players[other(s.me)].passed;
      const want = !s.g.players[s.me].hand.length || !ranked.length ? PASS
        : oppPassed && diffOf(s) > 0 ? PASS
        : ranked[0].play;
      for (const rnd of [always(0), always(0.999), mulberry(s.k)]) expect(decideEasy(s.g, s.me, rnd, k0), `match ${s.k}`).toEqual(want);
    }
  });

  it('while ahead and the opponent is still playing, Easy passes about aheadPassP (25%) of the time over a random stream', () => {
    const ahead = MID.filter(s => !s.g.players[other(s.me)].passed && diffOf(s) > 0 && hasPlay(s)).slice(0, 6);
    expect(ahead.length).toBe(6);
    let passes = 0, trials = 0;
    for (const s of ahead) for (let seed = 0; seed < 200; seed++) {
      trials++;
      if (decideEasy(s.g, s.me, mulberry(seed * 977 + s.k)).type === 'pass') passes++;
    }
    const mean = trials * EASY_KNOBS.aheadPassP, sd = Math.sqrt(trials * EASY_KNOBS.aheadPassP * (1 - EASY_KNOBS.aheadPassP));
    expect(passes).toBeGreaterThan(mean - 5 * sd);
    expect(passes).toBeLessThan(mean + 5 * sd);
  });

  describe('near-misses (mistakeP = 1, aheadPassP = 0 to see them every time)', () => {
    const variants: [string, Partial<EasyKnobs>][] = [
      ['designed depth 2, slack 4', {}],
      ['depth 1 (only the 2nd best card)', { mistakeDepth: 1 }],
      ['depth 3, slack 100', { mistakeDepth: 3, slack: 100 }],
      ['depth 2, slack 0 (ties only)', { slack: 0 }],
    ];
    // constants stand in for "the dice": under mistakeP = 1 they pick the 1st, middle and last eligible near-miss
    const dice = [0, 0.25, 0.5, 0.75, 0.999];
    const playing = MID.filter(x => !x.g.players[other(x.me)].passed && hasPlay(x)).slice(0, 100);

    it.each(variants)('a near-miss is a different card from the best, one of the best distinct cards, within slack: %s', (_name, o) => {
      const k = knobs({ ...o, mistakeP: 1, aheadPassP: 0 });
      let withNear = 0;
      for (const s of playing) {
        const ranked = rankedPlays(s.g, s.me);
        const best = ranked[0];
        const near = nearMisses(s.g, s.me, k).map(p => JSON.stringify(p));
        const seen = new Set<string>();
        for (const d of dice) {
          const a = decideEasy(s.g, s.me, always(d), k);
          expect(validate(s.g, s.me, a)).toBeNull();
          if (!near.length) {
            expect(a, `no eligible near-miss: plays the best (match ${s.k})`).toEqual(best.play);
            continue;
          }
          expect(near, `match ${s.k}: ${JSON.stringify(a)} is not an eligible near-miss`).toContain(JSON.stringify(a));
          const play = a as Play;
          expect(cardOf(s.g, s.me, play), 'a different card from the best play, not just another row').not.toBe(cardOf(s.g, s.me, best.play));
          const scored = must(ranked.find(r => JSON.stringify(r.play) === JSON.stringify(play)), 'a ranked play');
          expect(scored.v).toBeGreaterThanOrEqual(best.v - k.slack);
          seen.add(JSON.stringify(a));
        }
        if (near.length) {
          withNear++;
          expect(seen.size, `every eligible near-miss is reachable (match ${s.k})`).toBe(Math.min(near.length, dice.length));
        }
      }
      expect(withNear, 'states with a near-miss to take').toBeGreaterThan(15);
    });

    it('with the designed knobs a near-miss replaces the best play about mistakeP (20%) of the time', () => {
      const pool = playing.filter(s => diffOf(s) <= 0 && nearMisses(s.g, s.me, EASY_KNOBS).length > 0);
      expect(pool.length).toBeGreaterThanOrEqual(8);
      let misses = 0, trials = 0;
      for (const s of pool.slice(0, 8)) {
        const best = must(rankedPlays(s.g, s.me)[0], 'a play').play;
        for (let seed = 0; seed < 200; seed++) {
          trials++;
          if (JSON.stringify(decideEasy(s.g, s.me, mulberry(seed * 131 + s.k))) !== JSON.stringify(best)) misses++;
        }
      }
      const p = EASY_KNOBS.mistakeP, mean = trials * p, sd = Math.sqrt(trials * p * (1 - p));
      expect(misses).toBeGreaterThan(mean - 5 * sd);
      expect(misses).toBeLessThan(mean + 5 * sd);
    });
  });

  it('always returns an action the engine accepts, and uses only the rnd it is given', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      for (const s of [...MID, ...PASSED]) {
        for (let seed = 0; seed < 2; seed++) {
          const a = decideEasy(s.g, s.me, mulberry(seed + s.k));
          expect(validate(s.g, s.me, a), `match ${s.k} ${JSON.stringify(a)}`).toBeNull();
        }
      }
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('c5: on 300 positions where passing would lose the match and a card would take the round, Easy plays', () => {
    const losing = noThrowStates(300, 99000, bestTakingPlay);
    for (const s of losing) {
      for (let seed = 0; seed < 5; seed++) expect(decideEasy(s.g, s.me, mulberry(seed)).type, `match ${s.k} round ${s.g.round}`).toBe('play');
    }
  });
});

describe('the design\'s worked example: the same board, Medium and Easy', () => {
  function unit(cardId: string, owner: PIdx, row: Row, uid: string): Unit {
    const d = CARDS[cardId];
    const power = d.power ?? 0;
    return {
      uid, cardId, name: d.name, owner, house: d.house, power, base: power, row,
      grow: !!d.grow, guard: !!d.guard, shield: !!d.shield, poison: false, token: false, silenced: false,
    };
  }
  const hand = (ids: string[], pre: string): CardInst[] => ids.map((cardId, i) => ({ uid: pre + i, cardId }));

  /** Round 2; the bot (Ember, seat 1) won Round 1. Human: Bog Brute 4 (front), Thornling 2 (back, Grow). Bot board empty. 4 cards each. */
  function board(): GameState {
    const { state: g } = createGame({ houses: ['COVEN', 'EMBER'], seed: 1, first: 0 });
    g.round = 2;
    g.players[1].wins = 1;
    g.results.push({ round: 1, scores: [8, 10], winner: 1 });
    g.players[0].units = [unit('bog-brute', 0, 'F', 'hu0'), unit('thornling', 0, 'B', 'hu1')];
    g.players[0].hand = hand(['mire-toad', 'rootkeeper', 'bog-brute', 'blight-moth'], 'h');
    g.players[1].hand = hand(['pyre-hound', 'cinder-imp', 'brimstone-ogre', 'hellfire'], 'b');
    g.current = 1;
    g.starter = 1;
    return g;
  }

  it('the engine\'s scores match the walkthrough: Ogre +4.8, Cinder Imp (burn Thornling) +4.2, Pyre Hound +2.8, Hellfire +1.2', () => {
    const g = board();
    expect(totals(g)).toEqual([6, 0]);
    const best = new Map<string, ScoredPlay>();
    for (const r of rankedPlays(g, 1)) {
      const id = cardOf(g, 1, r.play);
      if (!best.has(id)) best.set(id, r);
    }
    expect([...best.keys()]).toEqual(['brimstone-ogre', 'cinder-imp', 'pyre-hound', 'hellfire']);
    expect(must(best.get('brimstone-ogre'), 'ogre').v).toBeCloseTo(4.8, 1);
    expect(must(best.get('cinder-imp'), 'imp').v).toBeCloseTo(4.2, 1);
    expect(must(best.get('cinder-imp'), 'imp').play.targets).toEqual(['hu1']);
    expect(must(best.get('pyre-hound'), 'hound').v).toBeCloseTo(2.8, 1);
    expect(must(best.get('hellfire'), 'hellfire').v).toBeCloseTo(1.2, 1);
  });

  it('Medium dry-passes here (it won a round and the human has not): the gap Easy and Hard play differently', () => {
    const g = board();
    for (const x of [0, 0.5, 0.99]) expect(decide(g, 1, always(x))).toEqual(PASS);
  });

  it('Easy is behind and the human has not passed, so it never passes: 80% the Ogre', () => {
    const g = board();
    const ogre = must(g.players[1].hand.find(c => c.cardId === 'brimstone-ogre'), 'ogre').uid;
    for (let seed = 0; seed < 60; seed++) {
      const a = decideEasy(g, 1, mulberry(seed));
      expect(a.type).toBe('play');
    }
    const a = decideEasy(g, 1, always(0.999));
    expect(a.type === 'play' ? a.uid : null).toBe(ogre);
  });

  it('when Easy errs it plays its 2nd or 3rd best card (Cinder Imp or Pyre Hound), never the 4th (Hellfire) and never the Ogre', () => {
    const g = board();
    const uid = (cardId: string) => must(g.players[1].hand.find(c => c.cardId === cardId), cardId).uid;
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const a = decideEasy(g, 1, mulberry(seed), knobs({ mistakeP: 1 }));
      expect(a.type).toBe('play');
      if (a.type === 'play') seen.add(a.uid);
    }
    expect([...seen].sort()).toEqual([uid('cinder-imp'), uid('pyre-hound')].sort());
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('shared/bot.ts additions (BL-1)', () => {
  // The old bestPlay, copied from before the rankedPlays refactor. The refactor must not change Medium (design R2).
  let skipped = 0;
  function legacyBestPlay(g: GameState, me: PIdx): ScoredPlay | null {
    const base = evaluate(g, me);
    const oppPassed = g.players[other(me)].passed;
    let best: ScoredPlay | null = null;
    for (const play of candidatePlays(g, me)) {
      const g2 = clone(g);
      try { doPlay(g2, me, play, []); endTurn(g2, me, []); } catch { skipped++; continue; }
      let v = evaluate(g2, me) - base;
      const def = CARDS[cardOf(g, me, play)];
      if (def.resolve && !oppPassed) v -= 2.5;
      if (def.tier === 'LEGEND' && g.round === 1) v -= 1.0;
      if (!best || v > best.v) best = { v, play };
    }
    return best;
  }

  const ALL: Sample[] = [...MID.slice(0, 100), ...PASSED.slice(0, 150)];
  const BOTH: { s: Sample; me: PIdx }[] = ALL.flatMap(s => ([0, 1] as PIdx[]).map(me => ({ s, me })));

  it('R2: rankedPlays(g, me)[0] is exactly what bestPlay returned before the refactor, for both seats on 500 states', () => {
    for (const { s, me } of BOTH) {
      const want = legacyBestPlay(s.g, me);
      const got = rankedPlays(s.g, me)[0] ?? null;
      expect(got, `match ${s.k} seat ${me} (the legacy copy skipped ${skipped} throwing plays so far)`).toEqual(want);
      expect(bestPlay(s.g, me), `bestPlay, match ${s.k} seat ${me}`).toEqual(want);
    }
  });

  it('rankedPlays lists every candidate play, best first, equal scores in candidatePlays order', () => {
    for (const { s, me } of BOTH.slice(0, 200)) {
      const ranked = rankedPlays(s.g, me);
      const cand = candidatePlays(s.g, me).map(p => JSON.stringify(p));
      const order = ranked.map(r => cand.indexOf(JSON.stringify(r.play)));
      expect(order.every(i => i >= 0), `match ${s.k}: a ranked play that is not a candidate play`).toBe(true);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].v, `sorted, match ${s.k}`).toBeGreaterThanOrEqual(ranked[i].v);
        if (ranked[i - 1].v === ranked[i].v) expect(order[i - 1], `stable ties, match ${s.k}`).toBeLessThan(order[i]);
      }
      expect(new Set(order).size, 'no play listed twice').toBe(order.length);
    }
  });

  it('lead(g, me) is my total minus theirs', () => {
    for (const { s, me } of BOTH.slice(0, 100)) {
      const t = totals(s.g);
      expect(lead(s.g, me)).toBe(t[me] - t[other(me)]);
    }
  });

  it('legalActions is pass followed by every candidate play the engine accepts', () => {
    for (const { s, me } of BOTH.slice(0, 200)) {
      const want = [PASS, ...candidatePlays(s.g, me).filter(p => validate(s.g, me, p) === null)];
      expect(legalActions(s.g, me), `match ${s.k} seat ${me}`).toEqual(want);
    }
  });

  describe('passThrowsMatch: passing now ends the match with me losing, and I still have a legal play', () => {
    const throwing = noThrowStates(150, 99500, bestTakingPlay);

    it('is true when the opponent has passed, I am behind, and losing the round loses the match', () => {
      for (const s of throwing) expect(passThrowsMatch(s.g, s.me), `match ${s.k} turn ${s.g.turnNo}`).toBe(true);
    });

    it('is false at the start of a match and whenever the opponent can still play (my pass does not end the round)', () => {
      const fresh = createGame({ houses: ['ORDER', 'EMBER'], seed: 5, first: 1 }).state;
      expect(passThrowsMatch(fresh, fresh.current)).toBe(false);
      // an opponent with an empty hand is passed for the engine's purposes (it auto-passes), so it is left out here
      const canPlay = MID.filter(x => !x.g.players[other(x.me)].passed && x.g.players[other(x.me)].hand.length > 0);
      expect(canPlay.length).toBeGreaterThan(100);
      for (const s of canPlay) expect(passThrowsMatch(s.g, s.me), `match ${s.k}`).toBe(false);
    });

    it('is false when passing wins or only loses a round: ahead after their pass, or Round 1', () => {
      const aheadOrEarly = PASSED.filter(s => diffOf(s) > 0 || s.g.round === 1);
      expect(aheadOrEarly.length).toBeGreaterThan(50);
      for (const s of aheadOrEarly) expect(passThrowsMatch(s.g, s.me), `match ${s.k} round ${s.g.round} lead ${diffOf(s)}`).toBe(false);
    });

    it('is false when I have no play left to make, even though passing loses the match', () => {
      for (const s of throwing) {
        const g = clone(s.g);
        g.players[s.me].hand = [];
        expect(passLosesMatch(g, s.me), 'passing still loses').toBe(true);
        expect(passThrowsMatch(g, s.me), `match ${s.k}`).toBe(false);
      }
    });

    it('agrees with an independent check (pass on a copy; loses the match; a legal play exists) and never mutates its input', () => {
      for (const { s, me } of BOTH) {
        const before = structuredClone(s.g);
        const want = passLosesMatch(s.g, me) && candidatePlays(s.g, me).some(p => validate(s.g, me, p) === null);
        expect(passThrowsMatch(s.g, me), `match ${s.k} seat ${me}`).toBe(want);
        expect(s.g).toEqual(before);
      }
    });
  });
});
