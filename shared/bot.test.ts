// DO NOT REGENERATE shared/__snapshots__/bot.test.ts.snap (never run vitest with -u on this file).
// The c3 snapshot is the "before" record of the Round 2/3 bot decisions from the bot as it was before DM-1.
// If it differs, the change altered Round 2/3 behaviour: fix the code, not the snapshot.
import { describe, it, expect } from 'vitest';
import { ALL_HOUSES, CARDS } from './cards';
import { Action, CardInst, GameState, PIdx, Row, Unit, applyAction, clone, createGame, doPlay, endTurn, totals } from './engine';
import { bestPlay, candidatePlays, decide } from './bot';
import { mulberry } from './sim';

type Play = Extract<Action, { type: 'play' }>;

function step(g: GameState, p: PIdx, a: Action) {
  const r = applyAction(g, p, a);
  if ('error' in r) throw new Error(`illegal ${JSON.stringify(a)} by ${p}: ${r.error}`);
}

function r1Game(s: number): GameState {
  const houses: [typeof ALL_HOUSES[number], typeof ALL_HOUSES[number]] = [ALL_HOUSES[s % 4], ALL_HOUSES[(s + 1 + ((s >> 2) % 3)) % 4]];
  return createGame({ houses, seed: s, first: 0 }).state;
}

/** The bot (seat 1) plays on until Round 1 ends; the human (seat 0) has already passed. */
function botFinishesRound1(g: GameState, rnd: () => number) {
  for (let i = 0; i < 60 && g.round === 1 && !g.over; i++) {
    if (g.current !== 1) throw new Error('expected the bot to be on turn');
    step(g, 1, decide(g, 1, rnd));
  }
  if (g.round === 1 && !g.over) throw new Error('round 1 did not end');
}

const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;

describe('bot Round 1 (DM-1)', () => {
  it('c1: after a human dry pass, the bot wins Round 1 in at least 98% of 2,000 seeds', { timeout: 60_000 }, () => {
    const N = 2000;
    let wins = 0;
    for (let s = 0; s < N; s++) {
      const g = r1Game(s);
      step(g, 0, { type: 'pass' });
      botFinishesRound1(g, mulberry(s));
      if (g.results[0].winner === 1) wins++;
    }
    expect(wins / N, `measured bot Round 1 win rate after dry pass: ${pct(wins, N)} (${wins}/${N}), bar 98%`).toBeGreaterThanOrEqual(0.98);
  });

  it('c1b: after the human plays its strongest card and passes, the bot wins Round 1 in at least 85% of 1,500 seeds', { timeout: 60_000 }, () => {
    const N = 1500;
    let wins = 0;
    for (let s = 0; s < N; s++) {
      const g = r1Game(s);
      let best: Play | null = null;
      let bestTotal = -Infinity;
      for (const play of candidatePlays(g, 0)) {
        const g2 = clone(g);
        doPlay(g2, 0, play, []);
        endTurn(g2, 0, []);
        const t = totals(g2)[0];
        if (t >= bestTotal) { bestTotal = t; best = play; } // ties: the later entry
      }
      const rnd = mulberry(s * 3 + 1);
      if (best) {
        step(g, 0, best);
        step(g, 1, decide(g, 1, rnd));
      }
      if (g.round === 1) {
        if (g.current !== 0) throw new Error('expected the human on turn');
        step(g, 0, { type: 'pass' });
        botFinishesRound1(g, rnd);
      }
      if (g.results[0].winner === 1) wins++;
    }
    expect(wins / N, `measured bot Round 1 win rate after strongest card then pass: ${pct(wins, N)} (${wins}/${N}), bar 85%`).toBeGreaterThanOrEqual(0.85);
  });
});

function unitOf(cardId: string, owner: PIdx, row: Row, uid: string): Unit {
  const d = CARDS[cardId];
  const power = d.power ?? 0;
  return {
    uid, cardId, name: d.name, owner, house: d.house, power, base: power, row,
    grow: false, guard: false, shield: false, poison: false, token: false, silenced: false,
  };
}
const hand = (ids: string[], pre: string): CardInst[] => ids.map((cardId, i) => ({ uid: pre + i, cardId }));

describe('bot First Light (DM-1 c2)', () => {
  function board(first: PIdx, humanUnit: string, botUnit: string, humanHand: string[], botHand: string[]): GameState {
    const { state: g } = createGame({ houses: ['COVEN', 'EMBER'], seed: 1, first });
    g.players[0].units = [unitOf(humanUnit, 0, 'F', 'hu0')];
    g.players[1].units = [unitOf(botUnit, 1, 'F', 'bu0')];
    g.players[0].hand = hand(humanHand, 'h');
    g.players[1].hand = hand(botHand, 'b');
    g.players[0].passed = true;
    g.current = 1;
    return g;
  }

  it('c2a: human went first and passed; bot units are 1 more but First Light (+2) puts it 1 behind, so the bot plays', () => {
    const g = board(0, 'bog-brute', 'flame-warden', ['thornling', 'mire-toad', 'bog-brute'], ['pyre-hound', 'cinder-imp', 'ash-cultist']);
    expect(totals(g)).toEqual([6, 5]);
    expect(decide(g, 1, () => 0.99).type).toBe('play');
  });

  it('c2b: bot went first and the human passed; bot units are 1 less but First Light (+2) puts it 1 ahead, so it passes', () => {
    const g = board(1, 'bog-brute', 'cinder-imp', ['thornling', 'mire-toad', 'bog-brute'], ['pyre-hound', 'cinder-imp', 'ash-cultist', 'hellfire']);
    expect(totals(g)).toEqual([4, 5]);
    expect(decide(g, 1, () => 0.99).type).toBe('pass');
  });
});

describe('bot Round 1 take rule: fixed boards (DM-1 pins)', () => {
  function r1Board(humanUnits: string[], botUnits: string[], humanHand: string[], botHand: string[]): GameState {
    const { state: g } = createGame({ houses: ['COVEN', 'EMBER'], seed: 1, first: 0 });
    g.players[0].units = humanUnits.map((c, i) => unitOf(c, 0, i % 2 === 0 ? 'F' : 'B', 'hu' + i));
    g.players[1].units = botUnits.map((c, i) => unitOf(c, 1, i % 2 === 0 ? 'F' : 'B', 'bu' + i));
    g.players[0].hand = hand(humanHand, 'h');
    g.players[1].hand = hand(botHand, 'b');
    g.players[0].passed = true;
    g.current = 1;
    return g;
  }

  it('c3b: the Round 1 take rule never fires in Round 2 (bot behind, 3 cards each, passes)', () => {
    const { state: g } = createGame({ houses: ['COVEN', 'EMBER'], seed: 1, first: 0 });
    g.round = 2;
    g.players[1].wins = 1;
    g.players[0].units = [unitOf('bog-brute', 0, 'F', 'hu0')];
    g.players[1].units = [unitOf('cinder-imp', 1, 'F', 'bu0')];
    g.players[0].hand = hand(['thornling', 'mire-toad', 'bog-brute'], 'h');
    g.players[1].hand = hand(['pyre-hound', 'cinder-imp', 'ash-cultist'], 'b');
    g.players[0].passed = true;
    g.current = 1;
    expect(totals(g)).toEqual([4, 3]);
    expect(decide(g, 1, () => 0.99).type).toBe('pass');
  });

  it('pin: of several taking plays the bot spends the one with the smallest winning margin', () => {
    // human 4 + First Light 2 = 6; bot has 3. Pyre Hound (6) would win by 3, Bog Brute (4) by 1; Thornling only ties.
    const g = r1Board(['bog-brute'], ['cinder-imp'], ['thornling', 'mire-toad', 'bog-brute'], ['pyre-hound', 'bog-brute', 'thornling']);
    const d = decide(g, 1, () => 0.99);
    expect(d.type).toBe('play');
    expect(d.type === 'play' ? d.uid : '').toBe('b1');
  });

  it('pin: the bot does not chase Round 1 when the human has committed 2 cards, even though one card would take it', () => {
    // human 4 + 4 + First Light 2 = 10; bot 8; a Bog Brute would make 12, but 2 opponent cards are on board.
    const g = r1Board(['bog-brute', 'bog-brute'], ['bog-brute', 'bog-brute'], ['thornling', 'mire-toad', 'bog-brute'], ['bog-brute', 'bog-brute', 'cinder-imp']);
    expect(totals(g)).toEqual([10, 8]);
    expect(decide(g, 1, () => 0.99).type).toBe('pass');
  });

  it('P1: the bot spends 2 cards to take Round 1 when no single card does, and plays the first step of bestPlay', () => {
    // human Bog Brute 4 + First Light 2 = 6; bot has nothing on board. One Bog Brute makes 4 (behind), two make 8 (ahead).
    // Gate: 1 opponent card on board, hand 3 - 2 = 1 >= human hand 2 - CARD_SLACK 1.
    const g = r1Board(['bog-brute'], [], ['thornling', 'mire-toad'], ['bog-brute', 'bog-brute', 'bog-brute']);
    expect(totals(g)).toEqual([6, 0]);
    const first = bestPlay(g, 1);
    expect(first).not.toBeNull();
    const d = decide(g, 1, () => 0.99);
    expect(d.type).toBe('play');
    expect(d).toEqual(first?.play);
  });

  it('P2: the bot never spends 2 cards on a Round 1 tie, it passes', () => {
    // human Lancer 6 + First Light 2 = 8; two Bog Brutes make exactly 8, a tie, and no single card gets ahead.
    const g = r1Board(['lancer'], [], ['thornling', 'mire-toad'], ['bog-brute', 'bog-brute', 'bog-brute']);
    expect(totals(g)).toEqual([8, 0]);
    expect(decide(g, 1, () => 0.99).type).toBe('pass');
  });

  it('P3: when a Legend and a non-Legend take the round by the same margin, the bot plays the non-Legend', () => {
    // human Bog Brute 4 + First Light 2 = 6; bot Bog Brute 4. Ser Halden (Legend, 6) and Lancer (6) both make 10, margin 4.
    // The Legend is first in hand, so only the tie-break (not hand order) can make the bot choose Lancer.
    const g = r1Board(['bog-brute'], ['bog-brute'], ['thornling', 'mire-toad'], ['halden', 'lancer']);
    expect(totals(g)).toEqual([6, 4]);
    expect(CARDS.halden.tier).toBe('LEGEND');
    expect(CARDS.lancer.tier).not.toBe('LEGEND');
    const d = decide(g, 1, () => 0.99);
    expect(d.type).toBe('play');
    expect(d.type === 'play' ? d.uid : '').toBe('b1');
  });
});

describe('bot Rounds 2 and 3 are unchanged (DM-1 c3)', () => {
  // The title is the snapshot key, so it must not change. Real coverage: the 400-decision cap is reached after only
  // ~33 of the 120 seeds, and just 5 decisions hit the gated Round 1 branch; c3b above pins that branch.
  it('c3: decisions on 120 seeded matches match the recorded snapshot', { timeout: 60_000 }, () => {
    const out: string[] = [];
    const MAX = 400;
    for (let seed = 80000; seed < 80120 && out.length < MAX; seed++) {
      const s = seed - 80000;
      const { state: g } = createGame({ houses: [ALL_HOUSES[s % 4], ALL_HOUSES[(s >> 2) % 4]], seed, first: (s % 2) as PIdx });
      const rnd = mulberry(seed);
      for (let n = 0; n < 400 && !g.over && out.length < MAX; n++) {
        const p = g.current;
        if (g.round >= 2) {
          const d = decide(g, p, mulberry(out.length + 1));
          out.push(`${seed} r${g.round} p${p} ${d.type === 'pass' ? 'pass' : `play ${d.uid} ${d.row ?? '-'} ${(d.targets ?? []).join(',')} ${d.mode ?? '-'} ${d.targetRow ?? '-'}`}`);
        }
        const c = candidatePlays(g, p);
        step(g, p, rnd() < 0.15 || !c.length ? { type: 'pass' } : c[Math.floor(rnd() * c.length)]);
      }
    }
    expect(out.length).toBeGreaterThan(100);
    expect(out).toMatchSnapshot();
  });
});
