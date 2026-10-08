// Records the bot decision golden (shared/__golden__/bot-levels.json): 50 decisions per level:version, the c8 snapshot.
// Usage: npm run bot-golden
// Records an entry only for an id that is missing from the file and refuses to overwrite an existing one. If an existing
// id's decisions have changed, it says so and exits 1: bump that level's version in shared/bots.ts (or bot-mcts.ts for
// Hard), then run this again to record the new id. Old ids stay in the file as history.
// The states come from goldenState() in shared/bot-fixtures.ts, the same function the golden test replays.
// Hard is recorded at 16 iterations under its key hard:mcts-1 (the key has no @params).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deckList } from '../shared/cards';
import { BOTS, BotPolicy, botDecide, goldenKey, hardPolicy } from '../shared/bots';
import { GOLDEN_SEED, GOLDEN_STATES, goldenState } from '../shared/bot-fixtures';
import { decisionSeed, mulberry } from '../shared/rng';

const GOLDEN_PATH = fileURLToPath(new URL('../shared/__golden__/bot-levels.json', import.meta.url));
const HARD_GOLDEN_ITERATIONS = 16;

const POLICIES: BotPolicy[] = [BOTS.easy, BOTS.medium, hardPolicy({ iterations: HARD_GOLDEN_ITERATIONS })];

function load(): Record<string, string[]> {
  if (!existsSync(GOLDEN_PATH)) return {};
  const parsed: unknown = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${GOLDEN_PATH} must be an object keyed by level:version`);
  }
  const out: Record<string, string[]> = {};
  for (const [key, lines] of Object.entries(parsed)) {
    if (!Array.isArray(lines) || lines.some(l => typeof l !== 'string')) throw new Error(`${GOLDEN_PATH}: ${key} must be a list of lines`);
    out[key] = lines.map(String);
  }
  return out;
}

/** `${seed} ${turnNo} ${JSON action}` for each of the 50 states: the bot to move decides with bot seed k and the starter list known. */
function record(policy: BotPolicy): string[] {
  const lines: string[] = [];
  for (let k = 0; k < GOLDEN_STATES; k++) {
    const g = goldenState(k);
    const me = g.current;
    const opp = me === 0 ? 1 : 0;
    const ctx = { rnd: mulberry(decisionSeed(k, g.turnNo)), know: { oppList: deckList(g.players[opp].house) } };
    const { action } = botDecide(policy, g, me, ctx);
    lines.push(`${GOLDEN_SEED + k} ${g.turnNo} ${JSON.stringify(action)}`);
  }
  return lines;
}

const golden = load();
let changed = 0, drifted = 0;
for (const policy of POLICIES) {
  const key = goldenKey(policy);
  const lines = record(policy);
  const old = golden[key];
  if (old === undefined) {
    golden[key] = lines;
    changed++;
    console.log(`recorded ${key} (${lines.length} decisions)`);
    continue;
  }
  const diffs = lines.filter((l, i) => l !== old[i]).length;
  if (diffs === 0) console.log(`kept ${key}: unchanged`);
  else {
    drifted++;
    console.error(`${key} already exists and ${diffs} of ${lines.length} decisions differ now: bump its version, then run this again. Not overwritten.`);
  }
}

if (changed > 0) {
  mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
  writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + '\n');
  console.log(`wrote ${GOLDEN_PATH}`);
}
if (drifted > 0) process.exitCode = 1;
