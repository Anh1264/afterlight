// BL-1 c4 (fair play), the part that lives in the shared determinize: the imagined world a bot thinks in is built from
// public information only. Design: docs/specs/bot-levels.md "Step 0" and "determinize, exactly"; ADR 0004.
import { describe, it, expect } from 'vitest';
import { CARDS, ALL_HOUSES, House, deckList, validateDeck } from './cards';
import { CardInst, GameState, PIdx, Unit, createGame } from './engine';
import { checkInvariants } from './sim';
import { mulberry } from './rng';
import { DeckKnowledge, determinize, revealedCards } from './determinize';
import { Sample, midMatchStates, must, other, scramble, scrambleCustom, shownCards, trajectoryStates } from './bot-fixtures';

const known = (g: GameState, me: PIdx): DeckKnowledge => ({ oppList: deckList(g.players[other(me)].house) });
const NOT_KNOWN: DeckKnowledge = { oppList: null };

const byUid = (a: CardInst, b: CardInst) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
const cardIds = (cs: readonly CardInst[]) => cs.map(c => c.cardId).sort();

/** Everything a human in seat `me` could read off the table (own hand and own deck as a set; not the engine seed). */
function publicPart(g: GameState, me: PIdx) {
  return {
    round: g.round, current: g.current, starter: g.starter, first: g.first, over: g.over, winner: g.winner,
    results: g.results, turnNo: g.turnNo, nextId: g.nextId,
    players: g.players.map(p => ({
      name: p.name, house: p.house, units: p.units, discard: p.discard, wins: p.wins, passed: p.passed,
      handCount: p.hand.length, deckCount: p.deck.length,
    })),
    myHand: g.players[me].hand,
    myDeck: g.players[me].deck.slice().sort(byUid),
  };
}

function multisetMinus(list: readonly string[], remove: readonly string[]): string[] {
  const out = list.slice();
  for (const id of remove) {
    const i = out.indexOf(id);
    if (i >= 0) out.splice(i, 1);
  }
  return out.sort();
}

function deepFreeze<T>(x: T): T {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}

// 200 starter-deck states, both seats as the bot: the same states the c4 level test uses (bots-fair.test.ts).
const STATES: Sample[] = midMatchStates(200, 91000);
const BOTH: { s: Sample; me: PIdx }[] = STATES.flatMap(s => ([0, 1] as PIdx[]).map(me => ({ s, me })));

describe('determinize: what the bot may know stays, what it may not know is redealt', () => {
  it('c4: the public part is copied unchanged (own hand, both boards, both discards, wins, passes, counts, round)', () => {
    for (const { s, me } of BOTH) {
      const v = determinize(s.g, me, mulberry(s.k), known(s.g, me));
      expect(publicPart(v, me), `state ${s.k} seat ${me}`).toEqual(publicPart(s.g, me));
    }
  });

  it('c4: the result is a consistent game state (no duplicate uids, nothing the engine would reject)', () => {
    for (const { s, me } of BOTH.slice(0, 120)) {
      expect(() => checkInvariants(determinize(s.g, me, mulberry(s.k), known(s.g, me))), `state ${s.k}`).not.toThrow();
    }
  });

  it('c4: the bot\'s own deck holds the same cards and is reshuffled, not read in its real order', () => {
    const big = must(STATES.find(s => s.g.players[s.me].deck.length >= 8), 'a state with a deck of 8 or more');
    const real = big.g.players[big.me].deck.map(c => c.uid).join();
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const v = determinize(big.g, big.me, mulberry(seed), known(big.g, big.me));
      expect(v.players[big.me].deck.slice().sort(byUid)).toEqual(big.g.players[big.me].deck.slice().sort(byUid));
      orders.add(v.players[big.me].deck.map(c => c.uid).join());
    }
    expect(orders.size, 'distinct deck orders over 20 streams').toBeGreaterThan(10);
    expect([...orders].filter(o => o === real).length, 'the real order should be rare').toBeLessThan(3);
  });

  it('c4: with a known list, the opponent\'s hand + deck is the list minus every card already revealed, on the same uids', () => {
    for (const { s, me } of BOTH) {
      const opp = other(me);
      const v = determinize(s.g, me, mulberry(s.k + 1), known(s.g, me));
      const expected = multisetMinus(deckList(s.g.players[opp].house), revealedCards(s.g, opp));
      const o = v.players[opp];
      expect(cardIds([...o.hand, ...o.deck]), `state ${s.k} seat ${me}`).toEqual(expected);
      expect([...o.hand, ...o.deck].map(c => c.uid).sort(), 'the uids stay with the opponent').toEqual(
        [...s.g.players[opp].hand, ...s.g.players[opp].deck].map(c => c.uid).sort());
      expect(o.hand.length).toBe(s.g.players[opp].hand.length);
      expect(o.deck.length).toBe(s.g.players[opp].deck.length);
    }
  });

  it('c4 core property: scrambling the hidden information (opponent hand and deck redealt, own deck reordered, engine seed changed) leaves determinize\'s output identical', () => {
    let hiddenChanged = 0, comparable = 0;
    for (const { s, me } of BOTH) {
      const sc = scramble(s.g, me, s.k * 31 + me);
      // the scramble itself must be a fair one: it moves hidden cards only
      expect(publicPart(sc, me), `scramble leaked into public info, state ${s.k}`).toEqual(publicPart(s.g, me));
      expect(sc.rng).not.toBe(s.g.rng);
      const opp = other(me);
      if (new Set(s.g.players[opp].hand.map(c => c.cardId)).size >= 2) {
        comparable++;
        if (cardIds(sc.players[opp].hand).join() !== cardIds(s.g.players[opp].hand).join()) hiddenChanged++;
      }
      const a = determinize(s.g, me, mulberry(s.k + 7), known(s.g, me));
      const b = determinize(sc, me, mulberry(s.k + 7), known(s.g, me));
      expect(b, `state ${s.k} seat ${me}: the view followed the hidden arrangement`).toEqual(a);
    }
    expect(hiddenChanged / comparable, 'the scramble must really change the opponent\'s hand').toBeGreaterThan(0.9);
  });

  it('c4 core property holds for a custom deck too (oppList null): the opponent\'s unrevealed cards may be a different legal deck completion', () => {
    const custom = midMatchStates(50, 92000, true);
    let hiddenChanged = 0, total = 0;
    for (const s of custom) for (const me of [0, 1] as PIdx[]) {
      const opp = other(me);
      const sc = scrambleCustom(s.g, me, s.k * 17 + me);
      // the scramble itself must be fair: public info intact, and revealed + hidden still a legal deck of the opponent's house
      expect(publicPart(sc, me), `scramble leaked into public info, state ${s.k}`).toEqual(publicPart(s.g, me));
      const hidden = [...sc.players[opp].hand, ...sc.players[opp].deck];
      expect(validateDeck(sc.players[opp].house, [...shownCards(s.g, opp), ...cardIds(hidden)]), `state ${s.k}`).toBeNull();
      total++;
      if (cardIds(hidden).join() !== cardIds([...s.g.players[opp].hand, ...s.g.players[opp].deck]).join()) hiddenChanged++;
      const a = determinize(s.g, me, mulberry(s.k + 3), NOT_KNOWN);
      const b = determinize(sc, me, mulberry(s.k + 3), NOT_KNOWN);
      expect(b, `custom-deck state ${s.k} seat ${me}: the view followed the real hidden cards`).toEqual(a);
    }
    expect(hiddenChanged / total, 'the scramble must really change the opponent\'s unrevealed cards').toBeGreaterThan(0.9);
  });

  it('is deterministic: the same state, seat, stream and knowledge give the same world', () => {
    for (const { s, me } of BOTH.slice(0, 40)) {
      expect(determinize(s.g, me, mulberry(5), known(s.g, me))).toEqual(determinize(s.g, me, mulberry(5), known(s.g, me)));
    }
  });

  it('c4: it samples other worlds rather than copying the real hidden cards (the real opponent hand shows up rarely)', () => {
    const fresh = createGame({ houses: ['EMBER', 'COVEN'], seed: 4, first: 0 }).state; // 8-card opening hands
    const real = cardIds(fresh.players[1].hand).join();
    let same = 0;
    const distinct = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const h = cardIds(determinize(fresh, 0, mulberry(seed), known(fresh, 0)).players[1].hand).join();
      distinct.add(h);
      if (h === real) same++;
    }
    expect(same).toBeLessThan(5);
    expect(distinct.size).toBeGreaterThan(40);
  });

  it('re-rolls the engine seed from the stream: a uint32 that differs from the real one', () => {
    let differs = 0;
    for (const { s, me } of BOTH) {
      const v = determinize(s.g, me, mulberry(s.k + 11), known(s.g, me));
      expect(Number.isInteger(v.rng) && v.rng >= 0 && v.rng < 2 ** 32).toBe(true);
      if (v.rng !== s.g.rng) differs++;
    }
    expect(differs / BOTH.length).toBeGreaterThan(0.99);
  });

  it('never mutates the real state it is given (works on a deeply frozen copy)', () => {
    for (const { s, me } of BOTH.slice(0, 60)) {
      const before = structuredClone(s.g);
      const frozen = deepFreeze(structuredClone(s.g));
      expect(() => determinize(frozen, me, mulberry(1), known(s.g, me))).not.toThrow();
      expect(frozen).toEqual(before);
    }
  });
});

describe('determinize: custom decks (oppList null) sample the house pool and still build a legal deck', () => {
  // 100 random-deck matches, 20 snapshots each = 2,000 states, a mix of early and late positions
  const states = trajectoryStates(100, 20, 93000, true);

  it('c4: revealed + sampled cards form a legal 25-card deck on 2,000 random-deck states', () => {
    expect(states.length).toBeGreaterThanOrEqual(2000);
    for (const s of states) {
      const me = s.me;
      const opp = other(me);
      const v = determinize(s.g, me, mulberry(s.k * 1000 + s.g.turnNo), NOT_KNOWN);
      const o = v.players[opp];
      const ids = [...revealedCards(s.g, opp), ...cardIds([...o.hand, ...o.deck])];
      expect(validateDeck(o.house, ids), `match ${s.k} turn ${s.g.turnNo}`).toBeNull();
      expect(o.hand.length).toBe(s.g.players[opp].hand.length);
      expect(o.deck.length).toBe(s.g.players[opp].deck.length);
    }
  });

  it('a list that does not fit (wrong house, wrong length) falls back to the house pool instead of throwing', () => {
    const wrongHouse = (h: House): House => ALL_HOUSES[(ALL_HOUSES.indexOf(h) + 1) % 4];
    for (const s of states.filter((_, i) => i % 20 === 7)) {
      const me = s.me;
      const opp = other(me);
      const oppHouse = s.g.players[opp].house;
      for (const list of [deckList(wrongHouse(oppHouse)), deckList(oppHouse).slice(0, 24)]) {
        const v = determinize(s.g, me, mulberry(3), { oppList: list });
        const o = v.players[opp];
        expect(validateDeck(oppHouse, [...revealedCards(s.g, opp), ...cardIds([...o.hand, ...o.deck])]), `match ${s.k}`).toBeNull();
        expect(o.hand.length + o.deck.length).toBe(s.g.players[opp].hand.length + s.g.players[opp].deck.length);
      }
    }
  });
});

describe('revealedCards: what the opponent has shown', () => {
  function unit(cardId: string, owner: PIdx, row: 'F' | 'B', uid: string, token = false): Unit {
    const d = CARDS[cardId];
    const power = d.power ?? 1;
    return {
      uid, cardId: token ? null : cardId, name: d.name, owner, house: d.house, power, base: power, row,
      grow: false, guard: false, shield: false, poison: false, token, silenced: false,
    };
  }

  it('c4: its discard, plus every non-token unit it owns on either board (stolen ones included), sorted', () => {
    const { state: g } = createGame({ houses: ['COVEN', 'EMBER'], seed: 1, first: 0 });
    g.players[1].discard = [{ uid: 'd1', cardId: 'pyre-hound' }, { uid: 'd2', cardId: 'cinder-imp' }, { uid: 'd3', cardId: 'pyre-hound' }];
    g.players[1].units = [
      unit('brimstone-ogre', 1, 'F', 'u1'),
      unit('bog-brute', 0, 'B', 'u2'),                       // seat 0's unit, taken over: on seat 1's board, not seat 1's card
      unit('ember-whelp', 1, 'B', 'u3', true),               // a token is not a card
    ];
    g.players[0].units = [
      unit('thornling', 0, 'F', 'u4'),
      unit('hue', 1, 'F', 'u5'),                             // seat 1's unit, taken over: on seat 0's board, still seat 1's card
    ];
    g.players[0].discard = [{ uid: 'd4', cardId: 'mawroot' }];
    expect(revealedCards(g, 1)).toEqual(['brimstone-ogre', 'cinder-imp', 'hue', 'pyre-hound', 'pyre-hound']);
    expect(revealedCards(g, 0)).toEqual(['bog-brute', 'mawroot', 'thornling']);
  });

  it('is empty at the start of a match and never reads the hand or the deck', () => {
    const { state: g } = createGame({ houses: ['ORDER', 'ECHO'], seed: 9, first: 1 });
    expect(revealedCards(g, 0)).toEqual([]);
    expect(revealedCards(g, 1)).toEqual([]);
  });
});
