// Bot-vs-bot matrix + random fuzz. Run: npm run sim [games-per-pair]
import { ALL_HOUSES } from './cards';
import { runFuzz, runMatrix } from './sim';

const N = Number(process.argv[2] ?? 200);
const fuzzed = runFuzz();
console.log(`fuzz: ${fuzzed} matches OK (random plays, random legal decks)`);
const { win, firstW, secondW, draws, rounds3, totalPlays, games } = runMatrix(N);
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
