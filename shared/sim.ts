// Side-effect-free simulation library: match player, invariants, fuzz batch, matrix. CLI lives in simulate.ts.
import { ALL_HOUSES, CARDS, DECK_RULES, House, deckPool, validateDeck } from './cards';
import { decide, candidatePlays } from './bot';
import { Action, GameState, PIdx, applyAction, createGame } from './engine';
import { mulberry } from './rng';

// moved to rng.ts (BL-1); re-exported so existing callers keep importing it from here
export { mulberry };

/** A random legal deck, used to fuzz every card in the pool. */
export function randomDeck(h: House, rnd: () => number): string[] {
  const pool = deckPool(h);
  const out: string[] = [];
  let guard = 0;
  while (out.length < DECK_RULES.SIZE && guard++ < 5000) {
    const id = pool[Math.floor(rnd() * pool.length)];
    {
      const trial = [...out, id];
      const copies = trial.filter(x => x === id).length;
      const legends = trial.filter(x => CARDS[x].tier === 'LEGEND').length;
      const rares = trial.filter(x => CARDS[x].tier === 'RARE').length;
      if (copies <= DECK_RULES.COPIES[CARDS[id].tier] && legends <= DECK_RULES.MAX_LEGENDS && rares <= DECK_RULES.MAX_RARES) out.push(id);
    }
  }
  const err = validateDeck(h, out);
  if (err) throw new Error('randomDeck: ' + err);
  return out;
}

export function playMatch(h0: House, h1: House, seed: number, first: PIdx, randomBots = false, randomDecks = false) {
  const rnd = mulberry(seed * 7 + 1);
  const decks = randomDecks ? [randomDeck(h0, rnd), randomDeck(h1, rnd)] as [string[], string[]] : undefined;
  const { state: g } = createGame({ houses: [h0, h1], seed, first, decks });
  let plays = 0;
  for (let i = 0; i < 400 && !g.over; i++) {
    const p = g.current;
    let a: Action;
    if (randomBots) {
      const c = candidatePlays(g, p);
      a = rnd() < 0.12 || !c.length ? { type: 'pass' } : c[Math.floor(rnd() * c.length)];
    } else a = decide(g, p, rnd);
    const r = applyAction(g, p, a);
    if ('error' in r) throw new Error(`illegal ${JSON.stringify(a)}: ${r.error}`);
    if (a.type === 'play') plays++;
    checkInvariants(g);
  }
  if (!g.over) throw new Error('match did not finish');
  return { g, plays };
}

export function checkInvariants(g: GameState) {
  for (const p of g.players) for (const u of p.units) if (u.power <= 0) throw new Error('dead unit on board ' + u.name);
  for (const p of g.players) if (p.hand.length > 10) throw new Error('hand over max');
  const ids = new Set<string>();
  for (const p of g.players) for (const c of [...p.deck, ...p.hand, ...p.discard, ...p.units]) { if (ids.has(c.uid)) throw new Error('dup card ' + c.uid + ' ' + (c.cardId ? CARDS[c.cardId].name : 'token')); ids.add(c.uid); }
}

/** The CLI's fuzz batch: 300 random-play matches + 400 random-deck matches. Throws on any violation. Returns the match count. */
export function runFuzz(): number {
  let n = 0;
  for (let s = 0; s < 300; s++) { playMatch(ALL_HOUSES[s % 4], ALL_HOUSES[(s >> 2) % 4], s, (s % 2) as PIdx, true); n++; }
  for (let s = 0; s < 400; s++) { playMatch(ALL_HOUSES[s % 4], ALL_HOUSES[(s >> 2) % 4], 9000 + s, (s % 2) as PIdx, s % 2 === 0, true); n++; }
  return n;
}

export interface MatrixResult {
  /** keyed "A>B": [A wins, B wins, draws] with A as the row house */
  win: Record<string, number[]>;
  firstW: number; secondW: number; draws: number; rounds3: number; totalPlays: number; games: number;
}

/** Bot-vs-bot matrix: every ordered house pair, n games each, alternating first seat. */
export function runMatrix(n: number): MatrixResult {
  const win: Record<string, number[]> = {};
  let firstW = 0, secondW = 0, draws = 0, rounds3 = 0, totalPlays = 0, games = 0;
  for (const a of ALL_HOUSES) for (const b of ALL_HOUSES) {
    if (a === b) continue;
    for (let k = 0; k < n; k++) {
      const f = (k % 2) as PIdx;
      const { g, plays } = playMatch(a, b, 1000 + k * 13 + a.length * 7 + b.length, f);
      games++; totalPlays += plays; if (g.results.length === 3) rounds3++;
      const key = a + '>' + b; win[key] ??= [0, 0, 0];
      if (g.winner === 'draw') { win[key][2]++; draws++; }
      else { win[key][g.winner === 0 ? 0 : 1]++; if (g.winner === f) firstW++; else secondW++; }
    }
  }
  return { win, firstW, secondW, draws, rounds3, totalPlays, games };
}
