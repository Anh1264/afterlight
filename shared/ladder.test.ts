// BL-1 c3 (ladder): the library behind `npm run ladder` / `npm run sim:bots`. These tests run the machinery on small
// game counts: the schedule, one recorded match, replay, the summary with Wilson intervals and the c3 pass/fail bars.
// The real 448-deal run (Hard at 160 iterations) is a script, not a vitest test: `npm run ladder -- --assert`.
// Design: docs/specs/bot-levels.md "Ladder (shared/ladder.ts, pure; scripts/ladder.ts, the CLI)".
import { describe, expect, it, vi } from 'vitest';
import { ALL_HOUSES, deckList } from './cards';
import { GameState, PIdx, applyAction, createGame } from './engine';
import { decide } from './bot';
import { BOTS, BotPolicy, RANDOM_BOT, botId, hardPolicy } from './bots';
import {
  DEFAULT_PAIRINGS, LadderBot, LadderJob, LadderRecord, LadderSummary, PairStats, playLadderMatch, replayRecord, schedule, summarize, wilson,
} from './ladder';
import { must, other } from './bot-fixtures';

const BASE_SEED = 20261008;
const META = { buildSha: 'abc1234' };
const SUMMARY_META = { createdAt: '2026-10-08T12:00:00.000Z', buildSha: 'abc1234', baseSeed: BASE_SEED, gamesPerPairing: 64, workers: 1 };
const bots = (hard: BotPolicy = hardPolicy({ iterations: 2 })): Record<LadderBot, BotPolicy> => ({ ...BOTS, hard, random: RANDOM_BOT });
const play = (job: LadderJob, b: Record<LadderBot, BotPolicy> = bots(), now: () => number = () => 0) => playLadderMatch(job, b, META, now);

const cellKey = (j: LadderJob) => `${j.houses[j.aSeat]}>${j.houses[other(j.aSeat)]} seat${j.aSeat} first${j.first}`;
const dealKey = (j: LadderJob) => `${j.seed} ${j.houses.join('/')} seat${j.aSeat} first${j.first}`;

/** The final state of a recorded match, rebuilt from its inputs only. */
function replayToEnd(r: LadderRecord): GameState {
  const { state: g } = createGame({
    houses: [r.seats[0].house, r.seats[1].house], seed: r.seed, first: r.firstSeat, decks: [r.seats[0].deck, r.seats[1].deck],
    names: ['Player 1', 'Player 2'],
  });
  for (const st of r.steps) {
    const x = applyAction(g, st.s, st.a);
    if ('error' in x) throw new Error(`${r.id}: recorded step is illegal: ${x.error}`);
  }
  return g;
}

describe('wilson: the 95% interval the c3 bars are judged on', () => {
  it('matches known values: 50/100, 90/100, 10/10, 0/10', () => {
    const [lo, hi] = wilson(0.5, 100);
    expect(lo).toBeCloseTo(0.4038, 3);
    expect(hi).toBeCloseTo(0.5962, 3);
    const [l9, h9] = wilson(0.9, 100);
    expect(l9).toBeCloseTo(0.8256, 3);
    expect(h9).toBeCloseTo(0.9448, 3);
    const [l1, h1] = wilson(1, 10);
    expect(l1).toBeCloseTo(0.7225, 3);
    expect(h1).toBeCloseTo(1, 6);
    const [l0, h0] = wilson(0, 10);
    expect(l0).toBeCloseTo(0, 6);
    expect(h0).toBeCloseTo(0.2775, 3);
  });

  it('defaults to z = 1.96 and takes another z: 99% interval for 50/100', () => {
    expect(wilson(0.5, 100)).toEqual(wilson(0.5, 100, 1.96));
    const [lo, hi] = wilson(0.5, 100, 2.576);
    expect(lo).toBeCloseTo(0.3753, 3);
    expect(hi).toBeCloseTo(0.6247, 3);
  });

  it('is a proper interval: inside [0, 1], around the score, narrower with more games, mirrored for 1 - score', () => {
    for (const n of [10, 40, 100, 448, 1000]) {
      for (const p of [0.05, 0.3, 0.5, 0.686, 0.9, 0.98]) {
        const [lo, hi] = wilson(p, n);
        expect(lo).toBeGreaterThanOrEqual(0);
        expect(hi).toBeLessThanOrEqual(1);
        expect(lo).toBeLessThan(p);
        expect(hi).toBeGreaterThan(p);
        const [mlo, mhi] = wilson(1 - p, n);
        expect(mlo).toBeCloseTo(1 - hi, 9);
        expect(mhi).toBeCloseTo(1 - lo, 9);
      }
    }
    const small = wilson(0.7, 50), big = wilson(0.7, 500);
    expect(big[1] - big[0]).toBeLessThan(small[1] - small[0]);
  });

  it('reproduces the design\'s Medium-vs-Easy measurement: 68.6% over 448 games is about 64.2%-72.8%', () => {
    const [lo, hi] = wilson(0.686, 448);
    expect(lo).toBeGreaterThan(0.640);
    expect(lo).toBeLessThan(0.646);
    expect(hi).toBeGreaterThan(0.724);
    expect(hi).toBeLessThan(0.732);
  });
});

describe('schedule: the same deals for every pairing, balanced seats, first players and houses', () => {
  const jobs = schedule({ gamesPerPairing: 400, baseSeed: BASE_SEED });
  const byPairing = new Map<string, LadderJob[]>();
  for (const j of jobs) byPairing.set(j.pairing, [...(byPairing.get(j.pairing) ?? []), j]);

  it('the default pairings are the six the report needs, a first: hard-medium, medium-easy, ... easy-random', () => {
    expect(DEFAULT_PAIRINGS.map(([a, b]) => `${a}-${b}`).sort()).toEqual(
      ['easy-random', 'hard-easy', 'hard-medium', 'hard-random', 'medium-easy', 'medium-random'].sort());
    expect([...byPairing.keys()].sort()).toEqual(DEFAULT_PAIRINGS.map(([a, b]) => `${a}-${b}`).sort());
  });

  it('c3: 400 games per pairing rounds up to 448, equal for every pairing', () => {
    expect(byPairing.size).toBe(6);
    for (const [pairing, list] of byPairing) {
      expect(list, pairing).toHaveLength(448);
      expect(list.map(j => j.i).sort((x, y) => x - y), `${pairing}: i runs 0..447`).toEqual(Array.from({ length: 448 }, (_, i) => i));
    }
    expect(jobs).toHaveLength(6 * 448);
  });

  it('c3: every ordered house pair (mirrors included) x the first bot\'s seat x first player is played exactly 7 times per pairing', () => {
    for (const [pairing, list] of byPairing) {
      const cells = new Map<string, number>();
      for (const j of list) cells.set(cellKey(j), (cells.get(cellKey(j)) ?? 0) + 1);
      expect(cells.size, `${pairing}: 16 house pairs x 2 seats x 2 first players`).toBe(64);
      for (const [cell, n] of cells) expect(n, `${pairing} ${cell}`).toBe(7);
    }
    const pairs = new Set(jobs.map(j => `${j.houses[j.aSeat]}>${j.houses[other(j.aSeat)]}`));
    expect(pairs.size).toBe(ALL_HOUSES.length ** 2);
  });

  it('c3: the first bot sits in seat 0 and moves first in exactly half the games, in every combination equally', () => {
    for (const [pairing, list] of byPairing) {
      const count = (f: (j: LadderJob) => boolean) => list.filter(f).length;
      expect(count(j => j.aSeat === 0), pairing).toBe(224);
      expect(count(j => j.first === 0), pairing).toBe(224);
      expect(count(j => j.aSeat === j.first), `${pairing}: a moves first`).toBe(224);
      expect(count(j => j.aSeat === 0 && j.first === 0), pairing).toBe(112);
    }
  });

  it('every pairing plays the same deals: the same seeds, houses, seats and first players', () => {
    const reference = [...must(byPairing.get('hard-medium'), 'hard-medium').map(dealKey)].sort();
    for (const [pairing, list] of byPairing) expect(list.map(dealKey).sort(), pairing).toEqual(reference);
    const seeds = must(byPairing.get('medium-easy'), 'medium-easy').map(j => j.seed).sort((x, y) => x - y);
    expect(seeds, 'seed = baseSeed + cellIndex * reps + rep covers baseSeed .. baseSeed + 447').toEqual(Array.from({ length: 448 }, (_, i) => BASE_SEED + i));
  });

  it('each job names its bots from its pairing, houses by seat, and carries two bot seeds', () => {
    for (const j of jobs) {
      expect(j.pairing).toBe(`${j.a}-${j.b}`);
      expect(j.houses).toHaveLength(2);
      expect(j.botSeeds).toHaveLength(2);
      for (const s of j.botSeeds) expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
    }
    const first = must(byPairing.get('medium-easy'), 'medium-easy');
    expect(new Set(first.map(j => j.botSeeds.join())).size, 'bot seeds differ from game to game').toBeGreaterThan(400);
  });

  it('is deterministic, and baseSeed moves every seed', () => {
    expect(schedule({ gamesPerPairing: 400, baseSeed: BASE_SEED })).toEqual(jobs);
    const moved = schedule({ gamesPerPairing: 64, baseSeed: BASE_SEED + 1000, pairings: [['medium', 'easy']] });
    const base = schedule({ gamesPerPairing: 64, baseSeed: BASE_SEED, pairings: [['medium', 'easy']] });
    expect(moved.map(j => j.seed)).toEqual(base.map(j => j.seed + 1000));
  });

  it('small counts: the 64-cell floor, rounded up to whole repetitions, and a pairings option', () => {
    const one = [['medium', 'easy']] as const;
    expect(schedule({ gamesPerPairing: 1, baseSeed: 5, pairings: one })).toHaveLength(64);
    const sixtyFour = schedule({ gamesPerPairing: 64, baseSeed: 5, pairings: one });
    expect(sixtyFour).toHaveLength(64);
    expect(new Set(sixtyFour.map(cellKey)).size, 'each cell once').toBe(64);
    expect(schedule({ gamesPerPairing: 65, baseSeed: 5, pairings: one })).toHaveLength(128);
    expect(new Set(sixtyFour.map(j => j.pairing))).toEqual(new Set(['medium-easy']));
  });
});

describe('one recorded match (a superset of a match_records row)', () => {
  const jobs = schedule({ gamesPerPairing: 64, baseSeed: BASE_SEED, pairings: [['medium', 'easy'], ['easy', 'random'], ['hard', 'medium']] });
  const mediumEasy = jobs.filter(j => j.pairing === 'medium-easy');
  const job = mediumEasy[17];

  it('carries the designed fields: ids, mode, seeds, seats, decks, steps, rounds, replay flag, nulls for what a sim has no value for', () => {
    const r = play(job);
    expect(r.v).toBe(1);
    expect(r.id).toBe(`medium-easy/${String(job.i).padStart(4, '0')}`);
    expect(r.mode).toBe('ladder');
    expect(r.startedAt).toBeNull();
    expect(r.endedAt).toBeNull();
    expect(r.buildSha).toBe('abc1234');
    expect(r.engineVersion === null || typeof r.engineVersion === 'number').toBe(true);
    expect(r.rulesHash === null || typeof r.rulesHash === 'string').toBe(true);
    expect(r.endReason).toBe('normal');
    expect(['p0', 'p1', 'draw']).toContain(r.outcome);
    expect([r.player0, r.player1, r.botSeat, r.botVersion, r.facts]).toEqual([null, null, null, null, null]);
    expect(r.seed).toBe(job.seed);
    expect(r.firstSeat).toBe(job.first);
    expect(r.pairing).toBe('medium-easy');
    expect(r.i).toBe(job.i);
    expect(r.error).toBeUndefined();
    expect(r.replayOk).toBe(true);
    expect(r.rounds.length).toBeGreaterThanOrEqual(2);
    expect(r.rounds.length).toBeLessThanOrEqual(3);
    for (const [n, round] of r.rounds.entries()) {
      expect(round.round).toBe(n + 1);
      expect(round.scores).toHaveLength(2);
    }
  });

  it('names the bot in each seat by id, with its house, its starter deck in dealt order, its seed and a bot device', () => {
    const r = play(job);
    const aSeat = job.aSeat, bSeat = other(aSeat);
    expect(r.seats[aSeat].bot).toBe('medium:heur-2');
    expect(r.seats[bSeat].bot).toBe('easy:heur-easy-1');
    for (const p of [0, 1] as PIdx[]) {
      const seat = r.seats[p];
      expect(seat.house).toBe(job.houses[p]);
      expect(seat.deck, 'dealt by the same rule whichever bot sits there').toEqual(deckList(job.houses[p]));
      expect(seat.source.toLowerCase()).toContain(`premade:starter-${job.houses[p].toLowerCase()}`);
      expect(seat.device).toBe('bot');
      expect(seat.botSeed).toBe(job.botSeeds[p]);
    }
  });

  it('c4 (same deck rule): every level and the random baseline is dealt its house\'s starter list', () => {
    for (const j of [jobs.find(x => x.pairing === 'easy-random'), jobs.find(x => x.pairing === 'hard-medium'), job]) {
      const r = play(must(j, 'a job'));
      for (const p of [0, 1] as PIdx[]) expect(r.seats[p].deck).toEqual(deckList(r.seats[p].house));
    }
  });

  it('records every decision in order: the player to move, the action, the wall offset and the think time', () => {
    const r = play(job);
    expect(r.steps.length).toBeGreaterThan(10);
    expect(must(r.steps[0], 'a first step').s).toBe(job.first);
    for (const st of r.steps) {
      expect([0, 1]).toContain(st.s);
      expect(['pass', 'play']).toContain(st.a.type);
      expect(Number.isFinite(st.w) && st.w >= 0).toBe(true);
      expect(st.ms, 'now() is constant, so no time passes').toBe(0);
      expect(st.guard === undefined || st.guard === true).toBe(true);
    }
  });

  it('replays: replayRecord is true, also after a round trip through a JSON line', () => {
    for (const j of [job, mediumEasy[40], must(jobs.find(x => x.pairing === 'easy-random'), 'an easy-random job')]) {
      const r = play(j);
      expect(replayRecord(r), j.pairing).toBe(true);
      const line = JSON.stringify(r);
      expect(line).not.toContain('\n');
      expect(replayRecord(JSON.parse(line) as LadderRecord)).toBe(true);
    }
  });

  it('a tampered record does not replay: wrong winner, wrong score, a missing last step', () => {
    const r = play(job);
    const flip: LadderRecord['outcome'] = r.outcome === 'p0' ? 'p1' : 'p0';
    expect(replayRecord({ ...r, outcome: flip })).toBe(false);
    const rounds = structuredClone(r.rounds);
    rounds[0].scores = [rounds[0].scores[0] + 1, rounds[0].scores[1]];
    expect(replayRecord({ ...r, rounds })).toBe(false);
    expect(replayRecord({ ...r, steps: r.steps.slice(0, -1) })).toBe(false);
  });

  it('is deterministic: the same job twice with a constant clock gives identical records', () => {
    expect(play(job)).toEqual(play(job));
    const hardJob = must(jobs.find(x => x.pairing === 'hard-medium'), 'a hard-medium job');
    expect(play(hardJob)).toEqual(play(hardJob));
  });

  it('the clock only changes w and ms: a ticking clock gives the same match', () => {
    let t = 0;
    const ticking = play(job, bots(), () => (t += 5));
    const still = play(job);
    const strip = (r: LadderRecord) => ({ ...r, steps: r.steps.map(st => ({ s: st.s, a: st.a, guard: st.guard })) });
    expect(strip(ticking)).toEqual(strip(still));
    expect(ticking.steps.every(st => st.ms >= 5), 'think time is measured with the injected clock').toBe(true);
    expect(ticking.steps.some(st => st.w > 0)).toBe(true);
  });

  it('is pure: no Date, performance or Math.random is read (the clock is injected)', () => {
    const spies = [vi.spyOn(Date, 'now'), vi.spyOn(performance, 'now'), vi.spyOn(Math, 'random')];
    try {
      play(job);
      play(must(jobs.find(x => x.pairing === 'hard-medium'), 'a hard-medium job'));
    } finally {
      for (const s of spies) s.mockRestore();
    }
    spies.forEach(s => expect(s).not.toHaveBeenCalled());
  });

  it('seats the first bot of the pairing in job.aSeat and the second in the other seat', () => {
    const strong: BotPolicy = { level: 'medium', version: 'strong-1', decide: (v, me, c) => decide(v, me, c.rnd) };
    const stubborn: BotPolicy = { level: 'easy', version: 'pass-1', decide: () => ({ type: 'pass' }) };
    for (const j of mediumEasy.slice(0, 8)) {
      const r = play(j, { ...bots(), medium: strong, easy: stubborn });
      expect(r.seats[j.aSeat].bot).toBe('medium:strong-1');
      expect(r.seats[other(j.aSeat)].bot).toBe('easy:pass-1');
      for (const st of r.steps) {
        if (st.s === j.aSeat) expect(st.guard, 'the strong bot is never guarded').toBeUndefined();
        else if (st.a.type === 'pass') expect(st.guard).toBeUndefined();
        else expect(st.guard, 'a pass-only bot only plays when the harness guard makes it').toBe(true);
      }
      expect(r.outcome, 'a bot that always passes loses').toBe(j.aSeat === 0 ? 'p0' : 'p1');
    }
  });

  it('a policy that throws or returns an illegal action ends the record with endReason error, outcome void and the message', () => {
    const boom: BotPolicy = { level: 'easy', version: 'boom-1', decide: () => { throw new Error('kaboom'); } };
    const cheat: BotPolicy = { level: 'easy', version: 'cheat-1', decide: () => ({ type: 'play', uid: 'nope', row: 'F' }) };
    const r1 = play(job, { ...bots(), easy: boom });
    expect(r1.endReason).toBe('error');
    expect(r1.outcome).toBe('void');
    expect(r1.error).toContain('kaboom');
    const r2 = play(job, { ...bots(), easy: cheat });
    expect(r2.endReason).toBe('error');
    expect(r2.outcome).toBe('void');
    expect(r2.error).toContain('easy:cheat-1');
  });

  it('Hard at 2 iterations plays four spread-out matches against Medium without errors, each replayable', { timeout: 60_000 }, () => {
    const hardJobs = jobs.filter(j => j.pairing === 'hard-medium');
    for (const j of [hardJobs[0], hardJobs[17], hardJobs[34], hardJobs[51]]) {
      const r = play(j);
      expect(r.endReason, r.error).toBe('normal');
      expect(r.seats[j.aSeat].bot).toBe('hard:mcts-1@2');
      expect(r.seats[other(j.aSeat)].bot).toBe('medium:heur-2');
      expect(replayRecord(r)).toBe(true);
    }
  });
});

describe('summarize: the report numbers and the c3 bars', () => {
  // two full 64-deal pairings with the real cheap bots (Hard is covered by the script, not here)
  const jobs = schedule({ gamesPerPairing: 64, baseSeed: BASE_SEED, pairings: [['medium', 'easy'], ['easy', 'random']] });
  const records = jobs.map(j => playLadderMatch(j, bots(), META, () => 0));
  const summary = summarize(records, SUMMARY_META);
  const pair = (name: string): PairStats => must(summary.pairs.find(p => p.pairing === name), name);

  /** a's score in one record, read straight from its fields */
  const aSeatOf = (r: LadderRecord): PIdx => (r.seats[0].bot.startsWith(r.pairing.split('-')[0] + ':') ? 0 : 1);
  const aScoreOf = (r: LadderRecord): number => (r.outcome === 'draw' ? 0.5 : r.outcome === (aSeatOf(r) === 0 ? 'p0' : 'p1') ? 1 : 0);

  it('every record replays and none errored', () => {
    expect(records.every(r => r.endReason === 'normal' && r.replayOk && replayRecord(r))).toBe(true);
  });

  it('echoes the run (version, time, build, seeds, games, workers) and names the bots it saw', () => {
    expect(summary.v).toBe(1);
    expect(summary.createdAt).toBe(SUMMARY_META.createdAt);
    expect(summary.buildSha).toBe('abc1234');
    expect(summary.baseSeed).toBe(BASE_SEED);
    expect(summary.gamesPerPairing).toBe(64);
    expect(summary.workers).toBe(1);
    expect(summary.bots.medium).toBe('medium:heur-2');
    expect(summary.bots.easy).toBe('easy:heur-easy-1');
    expect(summary.bots.random).toBe('random:uniform-1');
  });

  it('c3: every pairing has the same number of games, and wins + losses + draws add up', () => {
    expect(summary.pairs.map(p => p.pairing).sort()).toEqual(['easy-random', 'medium-easy']);
    for (const p of summary.pairs) {
      expect(p.games, p.pairing).toBe(64);
      expect(p.errors).toBe(0);
      expect(p.aWins + p.bWins + p.draws, p.pairing).toBe(64);
    }
    expect(pair('medium-easy').a).toBe('medium:heur-2');
    expect(pair('medium-easy').b).toBe('easy:heur-easy-1');
    expect(pair('easy-random').a).toBe('easy:heur-easy-1');
    expect(pair('easy-random').b).toBe('random:uniform-1');
  });

  it('c3: the score is a\'s wins plus half the draws over the games, with its Wilson interval', () => {
    for (const name of ['medium-easy', 'easy-random']) {
      const rs = records.filter(r => r.pairing === name);
      const p = pair(name);
      const wins = rs.filter(r => aScoreOf(r) === 1).length, draws = rs.filter(r => aScoreOf(r) === 0.5).length;
      expect(p.aWins, name).toBe(wins);
      expect(p.draws, name).toBe(draws);
      expect(p.bWins, name).toBe(rs.length - wins - draws);
      expect(p.aScore, name).toBeCloseTo((wins + draws / 2) / rs.length, 10);
      const [lo, hi] = wilson(p.aScore, rs.length);
      expect(p.ci95[0]).toBeCloseTo(lo, 10);
      expect(p.ci95[1]).toBeCloseTo(hi, 10);
    }
  });

  it('the cheap-bot ladder is sane: Medium beats Easy and Easy beats the random bot over 64 deals', () => {
    expect(pair('medium-easy').aScore).toBeGreaterThan(0.5);
    expect(pair('easy-random').aScore).toBeGreaterThan(0.5);
  });

  it('breaks results down by house pair, first player and seat, each cell played equally often', () => {
    for (const name of ['medium-easy', 'easy-random']) {
      const p = pair(name);
      const rs = records.filter(r => r.pairing === name);
      expect(Object.keys(p.byHouse), name).toHaveLength(16);
      for (const [key, s] of Object.entries(p.byHouse)) {
        expect(key).toMatch(/^[A-Z]+>[A-Z]+$/);
        expect(s.games, `${name} ${key}`).toBe(4);
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(1);
      }
      expect([p.bySeat.aSeat0.games, p.bySeat.aSeat1.games], name).toEqual([32, 32]);
      expect([p.byFirst.aFirst.games, p.byFirst.bFirst.games], name).toEqual([32, 32]);
      const seat0 = rs.filter(r => aSeatOf(r) === 0);
      expect(p.bySeat.aSeat0.score, name).toBeCloseTo(seat0.reduce((n, r) => n + aScoreOf(r), 0) / seat0.length, 10);
      const aFirst = rs.filter(r => r.firstSeat === aSeatOf(r));
      expect(p.byFirst.aFirst.score, name).toBeCloseTo(aFirst.reduce((n, r) => n + aScoreOf(r), 0) / aFirst.length, 10);
      const weighted = Object.values(p.byHouse).reduce((n, s) => n + s.score * s.games, 0) / 64;
      expect(weighted, name).toBeCloseTo(p.aScore, 10);
    }
  });

  it('reports how the matches went: round shares, who passed first, hand at the pass, cards left, guard count', () => {
    for (const p of summary.pairs) {
      for (const share of [p.rounds.twoZero, p.rounds.twoOne, p.rounds.withTie, p.rounds.r1WinnerWonMatch, ...p.rounds.aWonRound]) {
        expect(share, p.pairing).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(1);
      }
      expect(p.rounds.twoZero + p.rounds.twoOne).toBeLessThanOrEqual(1 + 1e-9);
      expect(p.rounds.aWonRound).toHaveLength(3);
      for (const who of ['a', 'b'] as const) {
        const s = p.passing[who];
        for (const k of ['passedFirst', 'handAtPass', 'playsBeforePass'] as const) expect(s[k], `${p.pairing} ${who} ${k}`).toHaveLength(3);
        for (const x of s.passedFirst) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); }
        for (const x of s.handAtPass) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(10); }
        for (const x of s.playsBeforePass) expect(x).toBeGreaterThanOrEqual(0);
      }
      expect(p.cardsLeftAtEnd.a).toBeGreaterThanOrEqual(0);
      expect(p.cardsLeftAtEnd.b).toBeGreaterThanOrEqual(0);
      expect(p.cardsLeftAtEnd.a).toBeLessThanOrEqual(10);
      expect(p.guards).toBe(records.filter(r => r.pairing === p.pairing).flatMap(r => r.steps).filter(st => st.guard).length);
    }
  });

  it('mean cards left at the end of a match are read from the match itself (replayed), not invented', () => {
    for (const name of ['medium-easy', 'easy-random']) {
      const rs = records.filter(r => r.pairing === name);
      let a = 0, b = 0;
      for (const r of rs) {
        const g = replayToEnd(r);
        a += g.players[aSeatOf(r)].hand.length;
        b += g.players[other(aSeatOf(r))].hand.length;
      }
      expect(pair(name).cardsLeftAtEnd.a, name).toBeCloseTo(a / rs.length, 6);
      expect(pair(name).cardsLeftAtEnd.b, name).toBeCloseTo(b / rs.length, 6);
    }
  });

  it('think times per bot id: one entry per decision, zero here because the clock is constant', () => {
    const decisionsOf = (id: string) => records.flatMap(r => r.steps.map(st => r.seats[st.s].bot === id)).filter(Boolean).length;
    for (const id of ['medium:heur-2', 'easy:heur-easy-1', 'random:uniform-1']) {
      const t = must(summary.think[id], id);
      expect(t.decisions, id).toBe(decisionsOf(id));
      expect([t.p50, t.p95, t.max, t.mean]).toEqual([0, 0, 0, 0]);
    }
  });

  it('think times follow the clock: p50 <= p95 <= max and the mean is at least one tick', () => {
    let t = 0;
    const job = must(jobs[3], 'a job');
    const ticking = [playLadderMatch(job, bots(), META, () => (t += 5)), playLadderMatch(must(jobs[9], 'a job'), bots(), META, () => (t += 5))];
    const s = summarize(ticking, SUMMARY_META);
    for (const x of Object.values(s.think)) {
      expect(x.decisions).toBeGreaterThan(0);
      expect(x.p50).toBeGreaterThanOrEqual(5);
      expect(x.p50).toBeLessThanOrEqual(x.p95);
      expect(x.p95).toBeLessThanOrEqual(x.max);
      expect(x.mean).toBeGreaterThanOrEqual(5);
    }
  });

  it('counts draws as half a win', () => {
    // Medium on both sides (labelled medium-easy) draws about 4% of the time: scan the deals for one
    const clone: BotPolicy = { level: 'easy', version: 'medium-clone-1', decide: (v, me, c) => decide(v, me, c.rnd) };
    const mirror = schedule({ gamesPerPairing: 640, baseSeed: 5000, pairings: [['medium', 'easy']] });
    let draw: LadderRecord | null = null;
    for (const j of mirror) {
      const r = playLadderMatch(j, { ...bots(), easy: clone }, META, () => 0);
      if (r.outcome === 'draw') { draw = r; break; }
    }
    const d = must(draw, 'a drawn match within 640 Medium mirror deals');
    const only = summarize([d], SUMMARY_META);
    const p = must(only.pairs[0], 'a pairing');
    expect([p.games, p.aWins, p.bWins, p.draws, p.aScore]).toEqual([1, 0, 0, 1, 0.5]);
  });

  it('an errored match is counted as an error, not as a result', () => {
    const boom: BotPolicy = { level: 'easy', version: 'boom-1', decide: () => { throw new Error('kaboom'); } };
    const bad = playLadderMatch(must(jobs[0], 'a job'), { ...bots(), easy: boom }, META, () => 0);
    const s = summarize([bad, ...records.filter(r => r.pairing === 'medium-easy').slice(0, 3)], SUMMARY_META);
    const p = must(s.pairs.find(x => x.pairing === 'medium-easy'), 'medium-easy');
    expect(p.errors).toBe(1);
    expect(p.aWins + p.bWins + p.draws).toBe(3);
  });
});

describe('summarize: the c3 bars decide pass or fail', () => {
  // Controlled outcomes without playing hundreds of matches: one real match won by the first bot and one lost, per pairing,
  // from a bot that plays Medium's moves against a bot that only passes (the harness guard makes the passer play when forced).
  const strong = (level: string): BotPolicy => ({ level, version: 'strong-1', decide: (v, me, c) => decide(v, me, c.rnd) });
  const weak = (level: string): BotPolicy => ({ level, version: 'weak-1', decide: () => ({ type: 'pass' }) });
  const jobsFor = (a: 'hard' | 'medium' | 'easy', b: 'medium' | 'easy' | 'random') =>
    must(schedule({ gamesPerPairing: 64, baseSeed: 777, pairings: [[a, b]] })[0], 'a job');

  function template(a: 'hard' | 'medium' | 'easy', b: 'medium' | 'easy' | 'random', aWins: boolean): LadderRecord {
    const job = jobsFor(a, b);
    const r = playLadderMatch(job, { ...bots(), [a]: aWins ? strong(a) : weak(a), [b]: aWins ? weak(b) : strong(b) }, META, () => 0);
    expect(r.endReason, r.error).toBe('normal');
    expect(r.outcome, `${a} should ${aWins ? 'win' : 'lose'}`).toBe((job.aSeat === 0) === aWins ? 'p0' : 'p1');
    return r;
  }
  /** `wins` copies of the won match and `losses` copies of the lost one, as distinct games of the pairing */
  function games(a: 'hard' | 'medium' | 'easy', b: 'medium' | 'easy' | 'random', wins: number, losses: number): LadderRecord[] {
    const won = template(a, b, true), lost = template(a, b, false);
    return Array.from({ length: wins + losses }, (_, i) => {
      const t = structuredClone(i < wins ? won : lost);
      return { ...t, i, id: `${t.pairing}/${String(i).padStart(4, '0')}` };
    });
  }
  const criterion = (s: LadderSummary, id: string) => must(s.criteria.find(c => c.id === id), id);
  const run = (rs: LadderRecord[]) => summarize(rs, { ...SUMMARY_META, gamesPerPairing: rs.length });

  it('hard-medium: needs a score of 75% or more AND a 95% interval whose lower bound is 70% or more', () => {
    const ninety = criterion(run(games('hard', 'medium', 90, 10)), 'c3-hard-medium');
    expect(ninety.value).toBeCloseTo(0.9, 9);
    expect(ninety.ciLow).toBeCloseTo(wilson(0.9, 100)[0], 9);
    expect(ninety.pass, '90/100').toBe(true);
    expect(criterion(run(games('hard', 'medium', 75, 25)), 'c3-hard-medium').pass, '75/100: score ok, interval too wide (low 65.7%)').toBe(false);
    expect(criterion(run(games('hard', 'medium', 300, 100)), 'c3-hard-medium').pass, '300/400: 75% with low bound 70.5%').toBe(true);
    expect(criterion(run(games('hard', 'medium', 280, 120)), 'c3-hard-medium').pass, '280/400: 70% score').toBe(false);
  });

  it('medium-easy: needs a score between 65% and 85% inclusive and a lower bound of 60% or more', () => {
    expect(criterion(run(games('medium', 'easy', 136, 64)), 'c3-medium-easy').pass, '136/200 = 68%, low 61.3%').toBe(true);
    expect(criterion(run(games('medium', 'easy', 180, 20)), 'c3-medium-easy').pass, '90% is too strong a gap').toBe(false);
    expect(criterion(run(games('medium', 'easy', 100, 100)), 'c3-medium-easy').pass, '50%').toBe(false);
    expect(criterion(run(games('medium', 'easy', 28, 12)), 'c3-medium-easy').pass, '28/40 = 70% but low bound 54.6%').toBe(false);
  });

  it('easy-random: needs a score of 80% or more', () => {
    const ok = criterion(run(games('easy', 'random', 90, 10)), 'c3-easy-random');
    expect(ok.value).toBeCloseTo(0.9, 9);
    expect(ok.pass).toBe(true);
    expect(criterion(run(games('easy', 'random', 70, 30)), 'c3-easy-random').pass).toBe(false);
    expect(criterion(run(games('easy', 'random', 80, 20)), 'c3-easy-random').pass, 'exactly 80%').toBe(true);
  });

  it('a summary only judges the pairings it contains', () => {
    const s = run(games('medium', 'easy', 136, 64));
    expect(s.criteria.map(c => c.id)).toEqual(['c3-medium-easy']);
    const both = summarize([...games('medium', 'easy', 136, 64), ...games('easy', 'random', 90, 10)], SUMMARY_META);
    expect(both.criteria.map(c => c.id).sort()).toEqual(['c3-easy-random', 'c3-medium-easy']);
  });
});
