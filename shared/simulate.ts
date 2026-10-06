// Bot-vs-bot matrix + random fuzz. Run: npm run sim [games-per-pair]
import { ALL_HOUSES, CARDS, DECK_RULES, House, deckPool, validateDeck } from './cards';
import { decide, candidatePlays } from './bot';
import { Action, GameState, PIdx, applyAction, createGame } from './engine';

function mulberry(seed: number) { return () => { let t = (seed = (seed + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

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

function play(h0: House, h1: House, seed: number, first: PIdx, randomBots = false, randomDecks = false) {
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
    check(g);
  }
  if (!g.over) throw new Error('match did not finish');
  return { g, plays };
}

function check(g: GameState) {
  for (const p of g.players) for (const u of p.units) if (u.power <= 0) throw new Error('dead unit on board ' + u.name);
  for (const p of g.players) if (p.hand.length > 10) throw new Error('hand over max');
  const ids = new Set<string>();
  for (const p of g.players) for (const c of [...p.deck, ...p.hand, ...p.discard]) { if (ids.has(c.uid)) throw new Error('dup card ' + c.uid + ' ' + CARDS[c.cardId].name); ids.add(c.uid); }
}

const N = Number(process.argv[2] ?? 200);
// fuzz
for (let s = 0; s < 300; s++) play(ALL_HOUSES[s % 4], ALL_HOUSES[(s >> 2) % 4], s, (s % 2) as PIdx, true);
for (let s = 0; s < 400; s++) play(ALL_HOUSES[s % 4], ALL_HOUSES[(s >> 2) % 4], 9000 + s, (s % 2) as PIdx, s % 2 === 0, true);
console.log('fuzz: 700 matches OK (random plays, random legal decks)');
const win: Record<string, number[]> = {};
let firstW = 0, secondW = 0, draws = 0, rounds3 = 0, totalPlays = 0, games = 0;
for (const a of ALL_HOUSES) for (const b of ALL_HOUSES) {
  if (a === b) continue;
  for (let k = 0; k < N; k++) {
    const f = (k % 2) as PIdx;
    const { g, plays } = play(a, b, 1000 + k * 13 + a.length * 7 + b.length, f);
    games++; totalPlays += plays; if (g.results.length === 3) rounds3++;
    const key = a + '>' + b; win[key] ??= [0, 0, 0];
    if (g.winner === 'draw') { win[key][2]++; draws++; }
    else { win[key][g.winner === 0 ? 0 : 1]++; if (g.winner === f) firstW++; else secondW++; }
  }
}
console.log('row vs col win% (both seats)');
console.log('       ' + ALL_HOUSES.map(h => h.padStart(7)).join(''));
for (const a of ALL_HOUSES) {
  let line = a.padEnd(7);
  for (const b of ALL_HOUSES) {
    if (a === b) { line += '      -'; continue; }
    const x = win[a + '>' + b], y = win[b + '>' + a];
    line += String(Math.round(100 * (x[0] + y[1]) / (2 * N))).padStart(7);
  }
  console.log(line);
}
console.log(`first ${(100 * firstW / games).toFixed(1)}%  second ${(100 * secondW / games).toFixed(1)}%  draws ${(100 * draws / games).toFixed(1)}%  round3 ${(100 * rounds3 / games).toFixed(0)}%  plays/match ${(totalPlays / games).toFixed(1)}`);
