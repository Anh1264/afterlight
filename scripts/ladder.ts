// The bot ladder CLI: plays every pairing on the same deals and writes the report.
// Usage: npm run ladder -- [--games 400] [--seed 20261008] [--pairs hard-medium,medium-easy] [--iterations 160]
//                          [--jobs N] [--out DIR] [--assert]
//        npm run sim:bots is the same command (criterion 3 names it). A bare number is --games, a second one --iterations.
// --jobs defaults to (CPU count - 1) worker_threads; --jobs 1 runs in this process. Output defaults to
// docs/balance/bot-levels/<YYYY-MM-DD>-<git sha>/ with summary.json, summary.md and matches.jsonl.gz.
// --assert exits 1 when a c3 bar fails, any match errored or any record does not replay.
// All I/O (arguments, workers, git, files, the clock) lives here; the library is shared/ladder.ts.
// Design: docs/specs/bot-levels.md "Ladder" and "CLI".
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { BOTS, BotPolicy, RANDOM_BOT, hardPolicy } from '../shared/bots';
import { HARD_ITERATIONS } from '../shared/bot-mcts';
import {
  DEFAULT_PAIRINGS, LadderBot, LadderJob, LadderRecord, LadderSummary, isLadderBot, playLadderMatch, renderSummaryMarkdown,
  schedule, summarize,
} from '../shared/ladder';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GZ_WARN_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------------------- shared by main and workers

interface WorkerInit { iterations: number; buildSha: string }
type ToWorker = { type: 'job'; job: LadderJob } | { type: 'stop' };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

function parseInit(x: unknown): WorkerInit {
  if (!isObject(x) || typeof x.iterations !== 'number' || typeof x.buildSha !== 'string') throw new Error('ladder worker: bad workerData');
  return { iterations: x.iterations, buildSha: x.buildSha };
}

function parseToWorker(x: unknown): ToWorker {
  if (isObject(x) && x.type === 'stop') return { type: 'stop' };
  if (isObject(x) && x.type === 'job' && isObject(x.job)) return { type: 'job', job: x.job as unknown as LadderJob };
  throw new Error('ladder worker: bad message');
}

function makeBots(iterations: number): Record<LadderBot, BotPolicy> {
  return { ...BOTS, hard: hardPolicy({ iterations }), random: RANDOM_BOT };
}

// ---------------------------------------------------------------------------------------------------------- worker thread

function workerMain(): void {
  const init = parseInit(workerData);
  const port = parentPort;
  if (!port) throw new Error('ladder worker: no parent port');
  const bots = makeBots(init.iterations);
  port.on('message', (raw: unknown) => {
    const msg = parseToWorker(raw);
    if (msg.type === 'stop') { port.close(); return; }
    port.postMessage({ type: 'record', record: playLadderMatch(msg.job, bots, { buildSha: init.buildSha }, () => performance.now()) });
  });
}

// ---------------------------------------------------------------------------------------------------------- main thread

interface Args {
  games: number; seed: number; pairs: (readonly [LadderBot, LadderBot])[]; iterations: number;
  jobs: number; out: string | null; assert: boolean;
}

function usage(msg: string): never {
  console.error(`ladder: ${msg}`);
  console.error('usage: npm run ladder -- [--games 400] [--seed 20261008] [--pairs hard-medium,medium-easy] [--iterations 160] [--jobs N] [--out DIR] [--assert]');
  process.exit(2);
}

function intArg(name: string, v: string | undefined, min: number): number {
  const n = Number(v);
  if (v === undefined || v.trim() === '' || !Number.isInteger(n) || n < min) usage(`${name} needs an integer >= ${min}, got ${v ?? 'nothing'}`);
  return n;
}

function parsePairs(v: string | undefined): (readonly [LadderBot, LadderBot])[] {
  if (v === undefined || v.trim() === '') usage('--pairs needs a list like hard-medium,medium-easy');
  return v.split(',').map(pair => {
    const [a, b, ...rest] = pair.split('-');
    if (!isLadderBot(a) || !isLadderBot(b) || rest.length > 0) usage(`unknown pairing "${pair}" (bots: easy, medium, hard, random)`);
    return [a, b] as const;
  });
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    games: 400, seed: 20261008, pairs: DEFAULT_PAIRINGS.slice(), iterations: HARD_ITERATIONS,
    jobs: Math.max(1, availableParallelism() - 1), out: null, assert: false,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--games': a.games = intArg(flag, argv[++i], 1); break;
      case '--seed': a.seed = intArg(flag, argv[++i], 0); break;
      case '--pairs': a.pairs = parsePairs(argv[++i]); break;
      case '--iterations': a.iterations = intArg(flag, argv[++i], 1); break;
      case '--jobs': a.jobs = intArg(flag, argv[++i], 1); break;
      case '--out': { const v = argv[++i]; if (!v) usage('--out needs a directory'); a.out = v; break; }
      case '--assert': a.assert = true; break;
      default:
        if (flag.startsWith('-')) usage(`unknown option ${flag}`);
        positional.push(flag);
    }
  }
  if (positional.length > 2) usage('too many arguments');
  if (positional[0] !== undefined) a.games = intArg('games', positional[0], 1);
  if (positional[1] !== undefined) a.iterations = intArg('iterations', positional[1], 1);
  return a;
}

/** Short git sha of HEAD, with -dirty when tracked files differ, so a report says which code produced it. */
function gitSha(): string {
  const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (head.status !== 0) {
    console.error(`ladder: git rev-parse failed (${head.stderr.trim() || head.error?.message || 'no output'}); buildSha is "unknown"`);
    return 'unknown';
  }
  const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' });
  return head.stdout.trim() + (dirty.status === 0 && dirty.stdout.trim() !== '' ? '-dirty' : '');
}

function progress(done: number, total: number, startedAt: number): void {
  const step = Math.max(1, Math.floor(total / 10));
  if (done % step !== 0 && done !== total) return;
  const secs = (performance.now() - startedAt) / 1000;
  console.error(`ladder: ${done}/${total} matches, ${secs < 90 ? `${secs.toFixed(0)} s` : `${(secs / 60).toFixed(1)} min`}`);
}

function playInProcess(jobs: LadderJob[], init: WorkerInit): LadderRecord[] {
  const bots = makeBots(init.iterations);
  const startedAt = performance.now();
  const out: LadderRecord[] = [];
  for (const job of jobs) {
    out.push(playLadderMatch(job, bots, { buildSha: init.buildSha }, () => performance.now()));
    progress(out.length, jobs.length, startedAt);
  }
  return out;
}

/** Jobs are handed out one at a time as workers free up, so a few slow Hard matches cannot leave the other workers idle. */
function playInWorkers(jobs: LadderJob[], workers: number, init: WorkerInit): Promise<LadderRecord[]> {
  return new Promise((resolveAll, rejectAll) => {
    const queue = jobs.slice();
    const out: LadderRecord[] = [];
    const startedAt = performance.now();
    let open = workers, failed = false;
    const fail = (e: unknown) => { if (!failed) { failed = true; rejectAll(e instanceof Error ? e : new Error(String(e))); } };
    for (let w = 0; w < workers; w++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: init });
      const next = () => {
        const job = queue.shift();
        const msg: ToWorker = job ? { type: 'job', job } : { type: 'stop' };
        worker.postMessage(msg);
      };
      worker.on('message', (raw: unknown) => {
        if (!isObject(raw) || raw.type !== 'record' || !isObject(raw.record)) { fail(new Error('ladder: bad worker message')); return; }
        out.push(raw.record as unknown as LadderRecord);
        progress(out.length, jobs.length, startedAt);
        next();
      });
      worker.on('error', fail);
      worker.on('exit', code => {
        if (code !== 0) fail(new Error(`ladder: a worker exited with code ${code}`));
        if (--open === 0 && !failed) {
          if (out.length === jobs.length) resolveAll(out);
          else fail(new Error(`ladder: workers finished ${out.length} of ${jobs.length} matches`));
        }
      });
      next();
    }
  });
}

const byPairingThenI = (x: LadderRecord, y: LadderRecord): number =>
  (x.pairing < y.pairing ? -1 : x.pairing > y.pairing ? 1 : 0) || x.i - y.i;

function printSummary(s: LadderSummary): void {
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  for (const p of s.pairs) {
    console.log(`${p.pairing.padEnd(14)} ${p.a} vs ${p.b}: ${p.games} games, ${pct(p.aScore)} (95% CI ${pct(p.ci95[0])} - ${pct(p.ci95[1])}), `
      + `${p.aWins}W ${p.bWins}L ${p.draws}D, ${p.errors} errors, ${p.guards} guarded passes`);
  }
  for (const c of s.criteria) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}: ${pct(c.value)} (CI lower bound ${pct(c.ciLow)})`);
  for (const [id, t] of Object.entries(s.think)) {
    console.log(`think ${id}: ${t.decisions} decisions, p50 ${t.p50.toFixed(1)} ms, p95 ${t.p95.toFixed(1)} ms, max ${t.max.toFixed(1)} ms`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const buildSha = gitSha();
  const jobs = schedule({ gamesPerPairing: args.games, baseSeed: args.seed, pairings: args.pairs });
  // hard pairings first: they are the slow ones, so they should not be the tail of the run
  jobs.sort((x, y) => Number(y.a === 'hard' || y.b === 'hard') - Number(x.a === 'hard' || x.b === 'hard'));
  const workers = Math.max(1, Math.min(args.jobs, jobs.length));
  const init: WorkerInit = { iterations: args.iterations, buildSha };
  const gamesPerPairing = jobs.length / args.pairs.length;
  console.error(`ladder: ${jobs.length} matches (${gamesPerPairing} per pairing), ${workers === 1 ? 'in this process' : `${workers} workers`}, build ${buildSha}, Hard at ${args.iterations} iterations`);

  const started = performance.now();
  const records = (workers === 1 ? playInProcess(jobs, init) : await playInWorkers(jobs, workers, init)).sort(byPairingThenI);
  const summary = summarize(records, { createdAt: new Date().toISOString(), buildSha, baseSeed: args.seed, gamesPerPairing, workers });

  const out = resolve(args.out ?? join(ROOT, 'docs', 'balance', 'bot-levels', `${summary.createdAt.slice(0, 10)}-${buildSha}`));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(join(out, 'summary.md'), renderSummaryMarkdown(summary));
  const gz = gzipSync(records.map(r => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(out, 'matches.jsonl.gz'), gz);
  if (gz.length > GZ_WARN_BYTES) {
    console.error(`ladder: matches.jsonl.gz is ${(gz.length / 1024 / 1024).toFixed(1)} MB (over 5 MB): commit only summary.json and summary.md`);
  }

  printSummary(summary);
  console.log(`wrote ${out} in ${((performance.now() - started) / 60000).toFixed(1)} min`);

  if (args.assert) {
    const problems: string[] = [];
    for (const c of summary.criteria) if (!c.pass) problems.push(`${c.id} failed`);
    const errored = records.filter(r => r.endReason === 'error');
    for (const r of errored.slice(0, 5)) problems.push(`${r.id} errored: ${r.error ?? 'unknown'}`);
    if (errored.length > 5) problems.push(`...and ${errored.length - 5} more errored matches`);
    const unreplayed = records.filter(r => r.endReason === 'normal' && !r.replayOk);
    for (const r of unreplayed.slice(0, 5)) problems.push(`${r.id} does not replay`);
    if (problems.length > 0) {
      console.error(`ladder --assert failed:\n  ${problems.join('\n  ')}`);
      process.exitCode = 1;
    }
  }
}

if (isMainThread) await main();
else workerMain();
