// Test support for the bot-level tests (BL-1). Not a test file and not production code: imported only by *.test.ts.
// Everything here is built from the public engine and bot API, and from modules that already exist, so a missing
// BL-1 module fails the tests that need it and nothing else.
import { ALL_HOUSES, CARDS, DECK_RULES, House, deckPool } from './cards';
import { decide } from './bot';
import { GameState, PIdx, applyAction, clone, createGame, totals } from './engine';
import { mulberry, randomDeck } from './sim';

export const other = (p: PIdx): PIdx => (p === 0 ? 1 : 0);

/** Narrowing helper for tests: no non-null assertions. */
export function must<T>(x: T | null | undefined, what: string): T {
  if (x === null || x === undefined) throw new Error(`expected ${what}`);
  return x;
}

/** 12 ordered pairs of different houses, rotating with k (same rotation as bot.test.ts's r1Game). */
export function housesFor(k: number): [House, House] {
  return [ALL_HOUSES[k % 4], ALL_HOUSES[(k + 1 + ((k >> 2) % 3)) % 4]];
}

/** A fresh match; with `randomDecks` both seats get a random legal deck (a custom deck as far as the bot knows). */
export function newGame(seed: number, k: number, randomDecks = false): GameState {
  const houses = housesFor(k);
  const rnd = mulberry(seed * 7 + 1);
  const decks = randomDecks ? [randomDeck(houses[0], rnd), randomDeck(houses[1], rnd)] as [string[], string[]] : undefined;
  return createGame({ houses, seed, first: (k % 2) as PIdx, decks }).state;
}

/** Medium plays both seats for `actions` actions. If the match ends first, returns the last state that was not over. */
export function playMedium(g: GameState, actions: number, rnd: () => number): GameState {
  let last = clone(g);
  for (let i = 0; i < actions && !g.over; i++) {
    last = clone(g);
    const p = g.current;
    const r = applyAction(g, p, decide(g, p, rnd));
    if ('error' in r) throw new Error(`fixture: illegal Medium action: ${r.error}`);
  }
  return g.over ? last : g;
}

export interface Sample { g: GameState; me: PIdx; k: number }

/** `count` mid-match states, the side to move is `me`. Lengths vary from 2 to 27 actions, so all three rounds appear. */
export function midMatchStates(count: number, baseSeed: number, randomDecks = false): Sample[] {
  const out: Sample[] = [];
  for (let k = 0; k < count; k++) {
    const seed = baseSeed + k;
    const g = playMedium(newGame(seed, k, randomDecks), 2 + ((k * 11) % 26), mulberry(seed));
    out.push({ g, me: g.current, k });
  }
  return out;
}

/** Many states from few matches: a snapshot after each of the first `perMatch` actions of `matches` Medium-vs-Medium matches. */
export function trajectoryStates(matches: number, perMatch: number, baseSeed: number, randomDecks: boolean): Sample[] {
  const out: Sample[] = [];
  for (let k = 0; k < matches; k++) {
    const seed = baseSeed + k;
    const g = newGame(seed, k, randomDecks);
    const rnd = mulberry(seed);
    for (let n = 0; n < perMatch && !g.over; n++) {
      out.push({ g: clone(g), me: g.current, k });
      const p = g.current;
      const r = applyAction(g, p, decide(g, p, rnd));
      if ('error' in r) throw new Error(`fixture: illegal Medium action: ${r.error}`);
    }
  }
  return out;
}

function shuffleIn<T>(a: T[], rnd: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Redeal everything `me` cannot see, in a way consistent with what it can see: the opponent's hand and deck get the
 * same cards in another arrangement (same counts; both the card-to-uid pairing and the hand/deck split change), `me`'s
 * own deck is reordered, and the engine's random seed is replaced.
 */
export function scramble(g: GameState, me: PIdx, seed: number): GameState {
  const rnd = mulberry(seed);
  const s = clone(g);
  const o = s.players[other(me)];
  const handSize = o.hand.length;
  const all = [...o.hand, ...o.deck];
  const cardIds = shuffleIn(all.map(c => c.cardId), rnd);
  const uids = shuffleIn(all.map(c => c.uid), rnd);
  const dealt = uids.map((uid, i) => ({ uid, cardId: cardIds[i] }));
  o.hand = dealt.slice(0, handSize);
  o.deck = dealt.slice(handSize);
  shuffleIn(s.players[me].deck, rnd);
  s.rng = (g.rng + 1 + Math.floor(rnd() * 2 ** 31)) >>> 0; // never equal to g.rng
  return s;
}

/** Card ids `owner` has shown: its discard plus every non-token unit it owns, on either board (public information). */
export function shownCards(g: GameState, owner: PIdx): string[] {
  const out = g.players[owner].discard.map(c => c.cardId);
  for (const pl of g.players) for (const u of pl.units) if (u.owner === owner && !u.token && u.cardId) out.push(u.cardId);
  return out.sort();
}

/**
 * A scramble for a custom deck, whose list the bot does not know: besides everything `scramble` moves, the opponent's
 * unrevealed cards are replaced by a different random completion of a legal 25-card deck that contains every revealed
 * card. That is "any other arrangement consistent with what the bot may know" when only the house pool is public.
 */
export function scrambleCustom(g: GameState, me: PIdx, seed: number): GameState {
  const s = scramble(g, me, seed);
  const opp = other(me);
  const o = s.players[opp];
  const n = o.hand.length + o.deck.length;
  const handSize = o.hand.length;
  const rnd = mulberry(seed * 2654435761);
  const pool = deckPool(o.house);
  const have = shownCards(g, opp);
  const picked: string[] = [];
  while (picked.length < n) {
    const all = [...have, ...picked];
    const legends = all.filter(id => CARDS[id].tier === 'LEGEND').length;
    const rares = all.filter(id => CARDS[id].tier === 'RARE').length;
    const ok = pool.filter(id => {
      const t = CARDS[id].tier;
      return all.filter(x => x === id).length < DECK_RULES.COPIES[t]
        && !(t === 'LEGEND' && legends >= DECK_RULES.MAX_LEGENDS) && !(t === 'RARE' && rares >= DECK_RULES.MAX_RARES);
    });
    picked.push(ok[Math.floor(rnd() * ok.length)]);
  }
  const uids = [...o.hand, ...o.deck].map(c => c.uid);
  const dealt = uids.map((uid, i) => ({ uid, cardId: picked[i] }));
  o.hand = dealt.slice(0, handSize);
  o.deck = dealt.slice(handSize);
  return s;
}

/**
 * Positions with the opponent's pass injected (a legal move) at a random turn of a Medium-vs-Medium match: the opponent
 * has passed, `me` is to move, and the round has not ended. Any round, `me` ahead or behind.
 */
export function oppPassedStates(count: number, baseSeed: number, perMatch = 3): Sample[] {
  const out: Sample[] = [];
  for (let k = 0; out.length < count; k++) {
    if (k > 20 * count) throw new Error(`fixture: only found ${out.length} of ${count} opponent-passed states`);
    const seed = baseSeed + k;
    const g = newGame(seed, k);
    const rnd = mulberry(seed);
    const pick = mulberry(seed ^ 0x2545f491);
    let kept = 0;
    for (let n = 0; n < 400 && !g.over && kept < perMatch && out.length < count; n++) {
      const p = g.current, me = other(p);
      if (n >= 3 && pick() < 0.3 && !g.players[p].passed && !g.players[me].passed) {
        const c = clone(g);
        const r0 = applyAction(c, p, { type: 'pass' });
        if (!('error' in r0) && !c.over && c.round === g.round && c.current === me && c.players[me].hand.length > 0) {
          out.push({ g: c, me, k });
          kept++;
        }
      }
      const r = applyAction(g, p, decide(g, p, rnd));
      if ('error' in r) throw new Error(`fixture: illegal Medium action: ${r.error}`);
    }
  }
  return out;
}

/** True when passing right now ends the match with `me` the loser (checked on a copy, public information only). */
export function passLosesMatch(g: GameState, me: PIdx): boolean {
  const c = clone(g);
  const r = applyAction(c, me, { type: 'pass' });
  return !('error' in r) && c.over && c.winner === other(me);
}

/**
 * Positions where the opponent has passed, `me` is strictly behind, losing the round loses the match, and some card
 * in hand would put `me` strictly ahead. They are Medium-vs-Medium positions with the opponent's pass injected (a legal
 * move) at a must-win turn: plain Medium-vs-Medium reaches only ~1 such turn in 10 matches (~70 s for 1,000), this
 * reaches ~2.5 per match. At most `perMatch` states are kept from one match.
 *
 * `takingPlay(g, me)` is the caller's `bestTakingPlay`.
 */
export function noThrowStates(
  count: number, baseSeed: number, takingPlay: (g: GameState, me: PIdx) => unknown, perMatch = 2,
): Sample[] {
  const out: Sample[] = [];
  for (let k = 0; out.length < count; k++) {
    if (k > 20 * count) throw new Error(`fixture: only found ${out.length} of ${count} no-throw states`);
    const seed = baseSeed + k;
    const g = newGame(seed, k);
    const rnd = mulberry(seed);
    let kept = 0;
    for (let n = 0; n < 400 && !g.over && kept < perMatch && out.length < count; n++) {
      const p = g.current, me = other(p);
      if (g.round >= 2 && !g.players[p].passed && !g.players[me].passed) {
        const c = clone(g);
        const r0 = applyAction(c, p, { type: 'pass' });
        if (!('error' in r0) && !c.over && c.round === g.round && c.current === me) {
          const t = totals(c);
          if (t[me] < t[p] && c.players[me].hand.length > 0 && passLosesMatch(c, me) && takingPlay(c, me)) {
            out.push({ g: c, me, k });
            kept++;
          }
        }
      }
      const r = applyAction(g, p, decide(g, p, rnd));
      if ('error' in r) throw new Error(`fixture: illegal Medium action: ${r.error}`);
    }
  }
  return out;
}

/**
 * The committed golden (shared/__golden__/bot-levels.json) is recorded on these states, one line per state:
 * `${seed} ${turnNo} ${JSON action}`, from `botDecide(policy, g, g.current, { rnd: mulberry(decisionSeed(k, g.turnNo)),
 * know: { oppList: deckList(opponent's house) } })`. State k: seed 70000 + k, houses housesFor(k), first player k % 2,
 * starter decks, Medium (`decide`, stream mulberry(seed)) plays both seats for (k * 7) % 22 + 3 actions; the side to
 * move is the bot. scripts/bot-golden.ts must record exactly these states (import this function).
 */
export const GOLDEN_STATES = 50;
export const GOLDEN_SEED = 70000;
export function goldenState(k: number): GameState {
  const seed = GOLDEN_SEED + k;
  return playMedium(newGame(seed, k), (k * 7) % 22 + 3, mulberry(seed));
}
