// The bot ladder, as a library: schedule, one recorded match, replay check, summary with Wilson intervals, the c3 bars.
// Pure: the clock is a parameter (`now`), so this file reads no Date, performance or Math.random. All I/O (arguments,
// workers, git, files) lives in scripts/ladder.ts, the `npm run ladder` / `npm run sim:bots` CLI.
// Design: docs/specs/bot-levels.md "Ladder (shared/ladder.ts, pure; scripts/ladder.ts, the CLI)".
import { ALL_HOUSES, House, deckList } from './cards';
import { Action, GameState, PIdx, RoundResult, applyAction, createGame } from './engine';
import { BotMove, BotPolicy, botDecide, botId } from './bots';
import { Level, isLevel } from './levels';
import { decisionSeed, mulberry } from './rng';

export type LadderBot = Level | 'random';

export const DEFAULT_PAIRINGS: readonly (readonly [LadderBot, LadderBot])[] = [
  ['medium', 'easy'], ['hard', 'medium'], ['hard', 'easy'], ['easy', 'random'], ['medium', 'random'], ['hard', 'random'],
];

export function isLadderBot(x: unknown): x is LadderBot {
  return x === 'random' || isLevel(x);
}

export interface LadderOptions {
  gamesPerPairing: number;
  baseSeed: number;
  pairings?: typeof DEFAULT_PAIRINGS;
}

export interface LadderJob {
  /** 'hard-medium' */
  pairing: string;
  /** 0..games-1 within the pairing */
  i: number;
  a: LadderBot;
  b: LadderBot;
  aSeat: PIdx;
  first: PIdx;
  /** by seat */
  houses: [House, House];
  seed: number;
  /** by seat */
  botSeeds: [number, number];
}

const other = (p: PIdx): PIdx => (p === 0 ? 1 : 0);

/** 16 ordered house pairs (mirrors included) x a's seat x first player. */
const CELLS = ALL_HOUSES.length * ALL_HOUSES.length * 2 * 2;

/**
 * Every pairing plays the same deals: 64 cells (16 ordered house pairs x a's seat x first player), ceil(games / 64) seeds
 * per cell (400 -> 448 games). seed = baseSeed + cellIndex * reps + rep, identical across pairings.
 */
export function schedule(o: LadderOptions): LadderJob[] {
  const pairings = o.pairings ?? DEFAULT_PAIRINGS;
  const reps = Math.max(1, Math.ceil(o.gamesPerPairing / CELLS));
  const jobs: LadderJob[] = [];
  for (const [a, b] of pairings) {
    for (let cell = 0; cell < CELLS; cell++) {
      const first = (cell % 2) as PIdx;
      const aSeat = (Math.floor(cell / 2) % 2) as PIdx;
      const housePair = Math.floor(cell / 4);
      const aHouse = ALL_HOUSES[Math.floor(housePair / ALL_HOUSES.length)];
      const bHouse = ALL_HOUSES[housePair % ALL_HOUSES.length];
      const houses: [House, House] = aSeat === 0 ? [aHouse, bHouse] : [bHouse, aHouse];
      for (let rep = 0; rep < reps; rep++) {
        const i = cell * reps + rep;
        const seed = o.baseSeed + i;
        jobs.push({
          pairing: `${a}-${b}`, i, a, b, aSeat, first, houses, seed,
          botSeeds: [decisionSeed(seed, 0x5eed0), decisionSeed(seed, 0x5eed1)],
        });
      }
    }
  }
  return jobs;
}

// ---------------------------------------------------------------------------------------------------------- records

export interface LadderSeat {
  house: House;
  /** dealt order */
  deck: string[];
  /** 'premade:starter-<house>' (+ '@<listHash>' once DP-1's version.ts exists) */
  source: string;
  /** botId, e.g. 'hard:mcts-1@160' */
  bot: string;
  device: 'bot';
  botSeed: number;
}

/** LoggedStep + ms: this decision's think time. `w` is the clock offset from the match start, `ms` the think time, `guard` marks a guarded pass. */
export interface LadderStep { s: PIdx; a: Action; w: number; ms: number; guard?: true }

/** One JSON line per match: a superset of data-platform's match_records row in its camelCase form. */
export interface LadderRecord {
  v: 1;
  /** 'hard-medium/0137' */
  id: string;
  mode: 'ladder';
  startedAt: null;
  endedAt: null;
  buildSha: string;
  engineVersion: number | null;
  rulesHash: string | null;
  endReason: 'normal' | 'error';
  outcome: 'p0' | 'p1' | 'draw' | 'void';
  player0: null;
  player1: null;
  botSeat: null;
  botVersion: null;
  seed: number;
  firstSeat: PIdx;
  seats: [LadderSeat, LadderSeat];
  steps: LadderStep[];
  rounds: RoundResult[];
  replayOk: boolean;
  facts: null;
  /** ladder-only */
  pairing: string;
  i: number;
  /** ladder-only: which seat the pairing's first bot ('a') sat in, so a record is summarised without guessing from bot ids */
  aSeat: PIdx;
  error?: string;
}

const pad4 = (n: number) => String(n).padStart(4, '0');

/** Rebuilds a match from a record's inputs only (houses, decks, seed, first player, steps). Null if a step is illegal. */
function replayToEnd(r: LadderRecord, visit?: (g: GameState, st: LadderStep) => void): GameState | null {
  const { state: g } = createGame({
    houses: [r.seats[0].house, r.seats[1].house], seed: r.seed, first: r.firstSeat,
    decks: [r.seats[0].deck, r.seats[1].deck], names: ['Player 1', 'Player 2'],
  });
  for (const st of r.steps) {
    visit?.(g, st);
    if ('error' in applyAction(g, st.s, st.a)) return null;
  }
  return g;
}

const outcomeOf = (g: GameState): LadderRecord['outcome'] => (g.winner === 0 ? 'p0' : g.winner === 1 ? 'p1' : 'draw');

const sameRounds = (x: readonly RoundResult[], y: readonly RoundResult[]): boolean =>
  x.length === y.length && x.every((a, k) => {
    const b = y[k];
    return a.round === b.round && a.winner === b.winner && a.scores[0] === b.scores[0] && a.scores[1] === b.scores[1];
  });

/** createGame(seed, first, decks, names 'Player 1'/'Player 2') + applyAction over steps; true if the match ends with the recorded rounds and winner. */
export function replayRecord(r: LadderRecord): boolean {
  const g = replayToEnd(r);
  return g !== null && g.over && outcomeOf(g) === r.outcome && sameRounds(g.results, r.rounds);
}

const MAX_ACTIONS = 400; // sim.ts's guard: a match that needs more has a bot stuck

/**
 * Plays one scheduled match and records it. Both decks are passed explicitly (the starter list, dealt order) and for each
 * decision ctx = { rnd: mulberry(decisionSeed(botSeeds[p], g.turnNo)), know: { oppList: the opponent's starter list } }.
 * A throw or an illegal action ends the record with endReason 'error', outcome 'void' and the message.
 */
export function playLadderMatch(
  job: LadderJob, bots: Readonly<Record<LadderBot, BotPolicy>>, meta: { buildSha: string }, now: () => number,
): LadderRecord {
  const seatBots: [BotPolicy, BotPolicy] = job.aSeat === 0 ? [bots[job.a], bots[job.b]] : [bots[job.b], bots[job.a]];
  const decks: [string[], string[]] = [deckList(job.houses[0]), deckList(job.houses[1])];
  const { state: g } = createGame({ houses: job.houses, seed: job.seed, first: job.first, decks, names: ['Player 1', 'Player 2'] });
  const start = now();
  const steps: LadderStep[] = [];
  let error: string | undefined;
  for (let n = 0; n < MAX_ACTIONS && !g.over; n++) {
    const p = g.current;
    const ctx = { rnd: mulberry(decisionSeed(job.botSeeds[p], g.turnNo)), know: { oppList: decks[other(p)] } };
    const before = now();
    let move: BotMove;
    try {
      move = botDecide(seatBots[p], g, p, ctx);
    } catch (e) {
      error = `seat ${p} turn ${g.turnNo}: ${e instanceof Error ? e.message : String(e)}`;
      break;
    }
    const after = now();
    const r = applyAction(g, p, move.action);
    if ('error' in r) { error = `seat ${p} turn ${g.turnNo}: ${botId(seatBots[p])} played an illegal action: ${r.error}`; break; }
    steps.push({ s: p, a: move.action, w: before - start, ms: after - before, ...(move.guarded ? { guard: true as const } : {}) });
  }
  if (!g.over && error === undefined) error = `${MAX_ACTIONS} actions without a finish`;

  const seat = (p: PIdx): LadderSeat => ({
    house: job.houses[p], deck: decks[p], source: `premade:starter-${job.houses[p].toLowerCase()}`,
    bot: botId(seatBots[p]), device: 'bot', botSeed: job.botSeeds[p],
  });
  const rec: LadderRecord = {
    v: 1, id: `${job.pairing}/${pad4(job.i)}`, mode: 'ladder', startedAt: null, endedAt: null,
    buildSha: meta.buildSha, engineVersion: null, rulesHash: null,
    endReason: error === undefined ? 'normal' : 'error', outcome: error === undefined ? outcomeOf(g) : 'void',
    player0: null, player1: null, botSeat: null, botVersion: null,
    seed: job.seed, firstSeat: job.first, seats: [seat(0), seat(1)], steps, rounds: g.results.map(x => ({ ...x, scores: [...x.scores] })),
    replayOk: false, facts: null, pairing: job.pairing, i: job.i, aSeat: job.aSeat,
    ...(error === undefined ? {} : { error }),
  };
  rec.replayOk = error === undefined && replayRecord(rec);
  return rec;
}

// ---------------------------------------------------------------------------------------------------------- summary

export interface Score { games: number; score: number }

export interface PairStats {
  /** 'hard-medium' */
  pairing: string;
  /** bot ids */
  a: string;
  b: string;
  /** every record of the pairing, errors included; the results below count only the games without an error */
  games: number;
  errors: number;
  guards: number;
  aWins: number;
  bWins: number;
  draws: number;
  /** a's share of the games, draws half */
  aScore: number;
  ci95: [number, number];
  /** 'EMBER>COVEN' = a's house > b's house */
  byHouse: Record<string, Score>;
  byFirst: { aFirst: Score; bFirst: Score };
  bySeat: { aSeat0: Score; aSeat1: Score };
  /** shares of games; aWonRound[k] is a's share of the games that played round k + 1 */
  rounds: {
    twoZero: number; twoOne: number; withTie: number;
    r1WinnerWonMatch: number; aWonRound: [number, number, number];
  };
  passing: Record<'a' | 'b', {
    /** share of the games that played round k + 1 in which it passed first */
    passedFirst: [number, number, number];
    /** mean own hand size at its pass, over the rounds it passed */
    handAtPass: [number, number, number];
    /** mean plays it made in the round before its pass, over the rounds it passed */
    playsBeforePass: [number, number, number];
  }>;
  /** mean hand size at match end */
  cardsLeftAtEnd: { a: number; b: number };
}

export interface ThinkStats { decisions: number; p50: number; p95: number; max: number; mean: number }

export interface CriterionResult { id: 'c3-hard-medium' | 'c3-medium-easy' | 'c3-easy-random'; value: number; ciLow: number; pass: boolean }

export interface LadderSummary {
  v: 1;
  createdAt: string;
  buildSha: string;
  baseSeed: number;
  gamesPerPairing: number;
  workers: number;
  /** the bots the records name; a summary only names the ones it saw */
  bots: Partial<Record<LadderBot, string>>;
  pairs: PairStats[];
  /** per bot id, ms */
  think: Record<string, ThinkStats>;
  criteria: CriterionResult[];
}

export interface SummaryMeta { createdAt: string; buildSha: string; baseSeed: number; gamesPerPairing: number; workers: number }

/** Wilson score interval for a share `score` over `n` games (draws count half in `score`). */
export function wilson(score: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (score + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((score * (1 - score)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);
const share = (hits: number, of: number): number => (of === 0 ? 0 : hits / of);

/** Nearest-rank percentile of an ascending list. */
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

function scoreOf(rs: readonly { aScore: number }[]): Score {
  return { games: rs.length, score: mean(rs.map(r => r.aScore)) };
}

/** What one scored record says about the pairing: a's score, and the bits the breakdowns group by. */
interface Scored { r: LadderRecord; aScore: number; aHouse: House; bHouse: House }

function pairStats(pairing: string, rs: readonly LadderRecord[]): PairStats {
  const first = rs[0];
  const aId = first.seats[first.aSeat].bot, bId = first.seats[other(first.aSeat)].bot;
  const scored: Scored[] = rs.filter(r => r.endReason === 'normal').map(r => {
    const aOutcome = r.aSeat === 0 ? 'p0' : 'p1';
    return {
      r, aScore: r.outcome === 'draw' ? 0.5 : r.outcome === aOutcome ? 1 : 0,
      aHouse: r.seats[r.aSeat].house, bHouse: r.seats[other(r.aSeat)].house,
    };
  });
  const aWins = scored.filter(s => s.aScore === 1).length;
  const draws = scored.filter(s => s.aScore === 0.5).length;
  const aScore = mean(scored.map(s => s.aScore));

  const byHouse: Record<string, Score> = {};
  const houseKeys = [...new Set(scored.map(s => `${s.aHouse}>${s.bHouse}`))].sort();
  for (const key of houseKeys) byHouse[key] = scoreOf(scored.filter(s => `${s.aHouse}>${s.bHouse}` === key));

  // rounds and passing come from the matches themselves: replay each record
  const rounds = { twoZero: 0, twoOne: 0, withTie: 0 };
  let r1Decided = 0, r1WinnerWon = 0;
  const reached = [0, 0, 0], aWonRound = [0, 0, 0];
  const passes = (['a', 'b'] as const).map(() => ({
    first: [0, 0, 0], passed: [0, 0, 0], hand: [0, 0, 0], plays: [0, 0, 0],
  }));
  const left = { a: 0, b: 0 };
  for (const s of scored) {
    const { r } = s;
    if (r.rounds.length === 2) rounds.twoZero++;
    if (r.rounds.length === 3 && r.outcome !== 'draw') rounds.twoOne++;
    if (r.rounds.some(x => x.winner === 'tie')) rounds.withTie++;
    const r1 = r.rounds[0];
    if (r1 && r1.winner !== 'tie') {
      r1Decided++;
      if ((r1.winner === 0 ? 'p0' : 'p1') === r.outcome) r1WinnerWon++;
    }
    r.rounds.forEach((x, k) => {
      if (k > 2) return;
      reached[k]++;
      if (x.winner === r.aSeat) aWonRound[k]++;
    });

    const firstPass = new Map<number, PIdx>();
    const playsSoFar = new Map<string, number>(); // `${round} ${seat}` -> plays made so far
    const end = replayToEnd(r, (g, st) => {
      const k = g.round - 1;
      const key = `${g.round} ${st.s}`;
      if (st.a.type === 'play') { playsSoFar.set(key, (playsSoFar.get(key) ?? 0) + 1); return; }
      if (k > 2) return;
      if (!firstPass.has(k)) firstPass.set(k, st.s);
      const side = passes[st.s === r.aSeat ? 0 : 1];
      side.passed[k]++;
      side.hand[k] += g.players[st.s].hand.length;
      side.plays[k] += playsSoFar.get(key) ?? 0;
    });
    for (const [k, seat] of firstPass) passes[seat === r.aSeat ? 0 : 1].first[k]++;
    if (end) {
      left.a += end.players[r.aSeat].hand.length;
      left.b += end.players[other(r.aSeat)].hand.length;
    }
  }
  const per = (side: number, field: 'first' | 'hand' | 'plays', denom: (k: number) => number): [number, number, number] =>
    [0, 1, 2].map(k => share(passes[side][field][k], denom(k))) as [number, number, number];
  const passing = (side: number) => ({
    passedFirst: per(side, 'first', k => reached[k]),
    handAtPass: per(side, 'hand', k => passes[side].passed[k]),
    playsBeforePass: per(side, 'plays', k => passes[side].passed[k]),
  });

  return {
    pairing, a: aId, b: bId, games: rs.length, errors: rs.length - scored.length,
    guards: rs.reduce((n, r) => n + r.steps.filter(st => st.guard).length, 0),
    aWins, bWins: scored.length - aWins - draws, draws, aScore, ci95: wilson(aScore, scored.length), byHouse,
    byFirst: {
      aFirst: scoreOf(scored.filter(s => s.r.firstSeat === s.r.aSeat)),
      bFirst: scoreOf(scored.filter(s => s.r.firstSeat !== s.r.aSeat)),
    },
    bySeat: {
      aSeat0: scoreOf(scored.filter(s => s.r.aSeat === 0)),
      aSeat1: scoreOf(scored.filter(s => s.r.aSeat === 1)),
    },
    rounds: {
      twoZero: share(rounds.twoZero, scored.length), twoOne: share(rounds.twoOne, scored.length),
      withTie: share(rounds.withTie, scored.length), r1WinnerWonMatch: share(r1WinnerWon, r1Decided),
      aWonRound: [0, 1, 2].map(k => share(aWonRound[k], reached[k])) as [number, number, number],
    },
    passing: { a: passing(0), b: passing(1) },
    cardsLeftAtEnd: { a: share(left.a, scored.length), b: share(left.b, scored.length) },
  };
}

function thinkStats(rs: readonly LadderRecord[]): Record<string, ThinkStats> {
  const byBot = new Map<string, number[]>();
  for (const r of rs) {
    for (const st of r.steps) {
      const id = r.seats[st.s].bot;
      const list = byBot.get(id);
      if (list) list.push(st.ms); else byBot.set(id, [st.ms]);
    }
  }
  const out: Record<string, ThinkStats> = {};
  for (const [id, ms] of [...byBot].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
    const sorted = ms.slice().sort((x, y) => x - y);
    out[id] = {
      decisions: sorted.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95),
      max: sorted[sorted.length - 1], mean: mean(sorted),
    };
  }
  return out;
}

/** The c3 bars: hard-medium score >= 0.75 and ciLow >= 0.70; medium-easy score in [0.65, 0.85] and ciLow >= 0.60; easy-random score >= 0.80. */
const BARS: { id: CriterionResult['id']; pairing: string; pass: (score: number, ciLow: number) => boolean }[] = [
  { id: 'c3-hard-medium', pairing: 'hard-medium', pass: (s, lo) => s >= 0.75 && lo >= 0.70 },
  { id: 'c3-medium-easy', pairing: 'medium-easy', pass: (s, lo) => s >= 0.65 && s <= 0.85 && lo >= 0.60 },
  { id: 'c3-easy-random', pairing: 'easy-random', pass: (s) => s >= 0.80 },
];

export function summarize(rs: readonly LadderRecord[], meta: SummaryMeta): LadderSummary {
  const byPairing = new Map<string, LadderRecord[]>();
  for (const r of rs) {
    const list = byPairing.get(r.pairing);
    if (list) list.push(r); else byPairing.set(r.pairing, [r]);
  }
  const pairs = [...byPairing].map(([pairing, list]) => pairStats(pairing, list));

  const bots: Partial<Record<LadderBot, string>> = {};
  for (const p of pairs) {
    const [a, b] = p.pairing.split('-');
    if (isLadderBot(a)) bots[a] = p.a;
    if (isLadderBot(b)) bots[b] = p.b;
  }

  const criteria: CriterionResult[] = [];
  for (const bar of BARS) {
    const p = pairs.find(x => x.pairing === bar.pairing);
    if (p) criteria.push({ id: bar.id, value: p.aScore, ciLow: p.ci95[0], pass: bar.pass(p.aScore, p.ci95[0]) });
  }
  return { v: 1, ...meta, bots, pairs, think: thinkStats(rs), criteria };
}

// ---------------------------------------------------------------------------------------------------------- markdown

const pct = (x: number, digits = 1): string => `${(100 * x).toFixed(digits)}%`;
const ms1 = (x: number): string => x.toFixed(1);

/** summary.md: the same numbers as summary.json, as tables. */
export function renderSummaryMarkdown(s: LadderSummary): string {
  const out: string[] = [];
  out.push(`# Bot ladder ${s.createdAt.slice(0, 10)} (${s.buildSha})`, '');
  out.push(`Seed ${s.baseSeed}, ${s.gamesPerPairing} games asked per pairing, ${s.workers} worker(s). Draws count half. Intervals are 95% Wilson.`, '');

  out.push('## Criterion 3', '');
  if (s.criteria.length === 0) out.push('No c3 pairing in this run.', '');
  else {
    out.push('| Criterion | Score | CI lower bound | Result |', '| --- | --- | --- | --- |');
    for (const c of s.criteria) out.push(`| ${c.id} | ${pct(c.value)} | ${pct(c.ciLow)} | ${c.pass ? 'PASS' : 'FAIL'} |`);
    out.push('');
  }

  out.push('## Pairings', '');
  out.push('| Pairing | A | B | Games | Errors | Guards | A wins | B wins | Draws | A score | 95% CI |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const p of s.pairs) {
    out.push(`| ${p.pairing} | ${p.a} | ${p.b} | ${p.games} | ${p.errors} | ${p.guards} | ${p.aWins} | ${p.bWins} | ${p.draws} | ${pct(p.aScore)} | ${pct(p.ci95[0])} - ${pct(p.ci95[1])} |`);
  }
  out.push('');

  out.push('## A\'s score by seat and first player', '');
  out.push('| Pairing | A in seat 0 | A in seat 1 | A moves first | B moves first |', '| --- | --- | --- | --- | --- |');
  for (const p of s.pairs) {
    out.push(`| ${p.pairing} | ${pct(p.bySeat.aSeat0.score)} | ${pct(p.bySeat.aSeat1.score)} | ${pct(p.byFirst.aFirst.score)} | ${pct(p.byFirst.bFirst.score)} |`);
  }
  out.push('');

  out.push('## A\'s score by house pair (A > B)', '');
  for (const p of s.pairs) {
    out.push(`**${p.pairing}**`, '', '| House pair | Games | A score |', '| --- | --- | --- |');
    for (const [key, v] of Object.entries(p.byHouse)) out.push(`| ${key} | ${v.games} | ${pct(v.score, 0)} |`);
    out.push('');
  }

  out.push('## How the matches went', '');
  out.push('| Pairing | 2-0 | 2-1 | With a tied round | Round 1 winner won the match | A won R1 | A won R2 | A won R3 | Cards left (A / B) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const p of s.pairs) {
    const r = p.rounds;
    out.push(`| ${p.pairing} | ${pct(r.twoZero, 0)} | ${pct(r.twoOne, 0)} | ${pct(r.withTie, 0)} | ${pct(r.r1WinnerWonMatch, 0)} | ${r.aWonRound.map(x => pct(x, 0)).join(' | ')} | ${p.cardsLeftAtEnd.a.toFixed(1)} / ${p.cardsLeftAtEnd.b.toFixed(1)} |`);
  }
  out.push('');

  out.push('## Passing (rounds 1 / 2 / 3)', '');
  out.push('| Pairing | Bot | Passed first | Hand at pass | Plays before pass |', '| --- | --- | --- | --- | --- |');
  for (const p of s.pairs) {
    for (const who of ['a', 'b'] as const) {
      const x = p.passing[who];
      out.push(`| ${p.pairing} | ${p[who]} | ${x.passedFirst.map(v => pct(v, 0)).join(' / ')} | ${x.handAtPass.map(v => v.toFixed(1)).join(' / ')} | ${x.playsBeforePass.map(v => v.toFixed(1)).join(' / ')} |`);
    }
  }
  out.push('');

  out.push('## Think time per decision (ms)', '');
  out.push('| Bot | Decisions | p50 | p95 | Max | Mean |', '| --- | --- | --- | --- | --- | --- |');
  for (const [id, t] of Object.entries(s.think)) out.push(`| ${id} | ${t.decisions} | ${ms1(t.p50)} | ${ms1(t.p95)} | ${ms1(t.max)} | ${ms1(t.mean)} |`);
  out.push('');
  return out.join('\n');
}
