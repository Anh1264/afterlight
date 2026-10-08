// Level 2 (determinized Monte Carlo) vs Level 1 (greedy) head-to-head. Run: npm run sim:bots -- [games] [iterations]
// Seats and the first player alternate every game; houses rotate through every pairing.
import { ALL_HOUSES } from './cards';
import { Action, PIdx, applyAction, createGame } from './engine';
import { decide } from './bot';
import { decideMcts } from './bot-mcts';
import { mulberry } from './sim';

const N = Number(process.argv[2] ?? 40);
const IT = Number(process.argv[3] ?? 160);
let w = 0, l = 0, d = 0, ms = 0, decisions = 0;
for (let k = 0; k < N; k++) {
  const houses: [typeof ALL_HOUSES[number], typeof ALL_HOUSES[number]] = [ALL_HOUSES[k % 4], ALL_HOUSES[(k + 1 + ((k >> 2) % 3)) % 4]];
  const l2: PIdx = (k % 2) as PIdx;
  const { state: g } = createGame({ houses, seed: 5000 + k, first: ((k >> 1) % 2) as PIdx });
  const rnd = mulberry(k * 31 + 7);
  while (!g.over) {
    const p = g.current;
    let a: Action;
    if (p === l2) { const t = performance.now(); a = decideMcts(g, p, rnd, { iterations: IT }); ms += performance.now() - t; decisions++; }
    else a = decide(g, p, rnd);
    const r = applyAction(g, p, a);
    if ('error' in r) throw new Error(`illegal ${JSON.stringify(a)}: ${r.error}`);
  }
  const res = g.winner === 'draw' ? 'D' : g.winner === l2 ? 'W' : 'L';
  if (res === 'W') w++; else if (res === 'L') l++; else d++;
  console.log(`game ${k + 1}/${N} ${houses[l2]} (L2) vs ${houses[l2 === 0 ? 1 : 0]} (L1): ${res}`);
}
console.log(`Level 2 vs Level 1: ${w}W ${l}L ${d}D -> ${(100 * (w + d / 2) / N).toFixed(1)}%  (${IT} iterations, ${(ms / decisions).toFixed(0)} ms/decision)`);
