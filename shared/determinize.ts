// The one fair view of a game: what a player in seat `me` could know, completed into a full GameState that a bot may
// simulate on. Used by the bot harness (bots.ts) for every level and by Hard's search for every imagined world.
// Design: docs/specs/bot-levels.md "Step 0" and "determinize, exactly"; ADR docs/decisions/0004-bot-policy-contract.md.
import { CARDS, DECK_RULES, deckPool } from './cards';
import { CardInst, GameState, PIdx, clone } from './engine';

/** What is public about the opponent's deck: its list for a starter or premade, null for a custom deck. */
export interface DeckKnowledge { readonly oppList: readonly string[] | null }

const other = (p: PIdx): PIdx => (p === 0 ? 1 : 0);

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Card ids of `owner`'s cards that have been revealed: its discard plus every non-token unit it owns on either board. Sorted. */
export function revealedCards(g: Readonly<GameState>, owner: PIdx): string[] {
  const out = g.players[owner].discard.map(c => c.cardId);
  for (const pl of g.players) {
    for (const u of pl.units) if (u.owner === owner && !u.token && u.cardId !== null) out.push(u.cardId);
  }
  return out.sort(cmp);
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The known list minus the revealed cards (as multisets), or null if it does not fit `n` hidden cards. */
function listMinusRevealed(list: readonly string[], revealed: readonly string[], n: number): string[] | null {
  const left = list.slice();
  for (const id of revealed) {
    const i = left.indexOf(id);
    if (i < 0) return null;
    left.splice(i, 1);
  }
  return left.length === n ? left : null;
}

/**
 * `n` card ids for a deck whose list is unknown: each pick is uniform over the house pool ids that the deck rules still
 * allow once the revealed and already-picked cards are counted. The candidate set is recomputed per pick, so there is no
 * rejection loop; the revealed cards plus the picks form a legal deck.
 */
function sampleFromPool(g: Readonly<GameState>, owner: PIdx, revealed: readonly string[], n: number, rnd: () => number): string[] {
  const pool = deckPool(g.players[owner].house);
  const count = new Map<string, number>();
  let legends = 0, rares = 0;
  const take = (id: string) => {
    count.set(id, (count.get(id) ?? 0) + 1);
    const tier = CARDS[id].tier;
    if (tier === 'LEGEND') legends++;
    else if (tier === 'RARE') rares++;
  };
  for (const id of revealed) take(id);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const allowed = pool.filter(id => {
      const tier = CARDS[id].tier;
      return (count.get(id) ?? 0) < DECK_RULES.COPIES[tier]
        && !(tier === 'LEGEND' && legends >= DECK_RULES.MAX_LEGENDS)
        && !(tier === 'RARE' && rares >= DECK_RULES.MAX_RARES);
    });
    // an empty set means the revealed cards already broke the deck rules (a state no legal deck produces): any pool card keeps the view usable
    const from = allowed.length > 0 ? allowed : pool;
    const id = from[Math.floor(rnd() * from.length)];
    take(id);
    out.push(id);
  }
  return out;
}

/** A copy of g that holds only what `me` may know; never mutates g. Output depends only on the public part of g, `know` and the rnd stream. */
export function determinize(g: Readonly<GameState>, me: PIdx, rnd: () => number, know: DeckKnowledge): GameState {
  const s = clone(g);
  const opp = other(me);

  // own deck: its cards are known, their order is not
  const mine = s.players[me].deck;
  mine.sort((a, b) => cmp(a.cardId, b.cardId) || cmp(a.uid, b.uid));
  shuffle(mine, rnd);

  // the opponent's hidden cards: which ids they are (known list or house pool), then which uid holds which
  const o = s.players[opp];
  const handSize = o.hand.length;
  const n = handSize + o.deck.length;
  const uids = [...o.hand, ...o.deck].map(c => c.uid).sort(cmp);
  const revealed = revealedCards(g, opp);
  const ids = (know.oppList ? listMinusRevealed(know.oppList, revealed, n) : null) ?? sampleFromPool(g, opp, revealed, n, rnd);
  shuffle(ids.sort(cmp), rnd);
  const dealt: CardInst[] = uids.map((uid, i) => ({ uid, cardId: ids[i] }));
  o.hand = dealt.slice(0, handSize);
  o.deck = dealt.slice(handSize);

  s.rng = Math.floor(rnd() * 2 ** 32) >>> 0;
  return s;
}
