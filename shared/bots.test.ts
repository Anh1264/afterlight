// BL-1: the bot registry, the one fair harness (botDecide) and the committed decision golden.
// c8 (recorded and pluggable: versioned ids, the 50-state golden) and the contract c4/c5 rest on.
// c4 (fair play across 200 states) lives in bots-fair.test.ts and c5 (no thrown matches) in bots-no-throw.test.ts,
// one file each so vitest runs them in parallel (design R8).
// Design: docs/specs/bot-levels.md section 3; ADR docs/decisions/0004-bot-policy-contract.md.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deckList } from './cards';
import { Action, GameState, PIdx, applyAction, createGame, validate } from './engine';
import { legalActions } from './bot';
import { DeckKnowledge, determinize } from './determinize';
import { DEFAULT_LEVEL, LEVELS, LEVEL_INFO, Level, isLevel } from './levels';
import { decisionSeed, mulberry } from './rng';
import { mulberry as simMulberry } from './sim';
import { BOTS, BotContext, BotPolicy, RANDOM_BOT, botDecide, botId, goldenKey, hardPolicy } from './bots';
import { GOLDEN_SEED, GOLDEN_STATES, Sample, goldenState, midMatchStates, other } from './bot-fixtures';

const starter = (g: GameState, me: PIdx): DeckKnowledge => ({ oppList: deckList(g.players[other(me)].house) });
const ctxFor = (g: GameState, me: PIdx, botSeed: number, know: DeckKnowledge = starter(g, me)): BotContext =>
  ({ rnd: mulberry(decisionSeed(botSeed, g.turnNo)), know });

afterEach(() => { vi.restoreAllMocks(); });

describe('registry: the ids the logs and match records will carry (c8)', () => {
  it('c8: the three levels are easy:heur-easy-1, medium:heur-2 and hard:mcts-1@160', () => {
    expect(Object.keys(BOTS).sort()).toEqual([...LEVELS].sort());
    expect(botId(BOTS.easy)).toBe('easy:heur-easy-1');
    expect(botId(BOTS.medium)).toBe('medium:heur-2');
    expect(botId(BOTS.hard)).toBe('hard:mcts-1@160');
    for (const level of LEVELS) expect(BOTS[level].level).toBe(level);
  });

  it('c8: golden keys are level:version without the params, so retuning Hard changes the id but not the key', () => {
    expect(goldenKey(BOTS.easy)).toBe('easy:heur-easy-1');
    expect(goldenKey(BOTS.medium)).toBe('medium:heur-2');
    expect(goldenKey(BOTS.hard)).toBe('hard:mcts-1');
    expect(goldenKey(hardPolicy({ iterations: 16 }))).toBe('hard:mcts-1');
    expect(botId(hardPolicy({ iterations: 16 }))).toBe('hard:mcts-1@16');
  });

  it('c8: botId is level:version, plus @params only when the policy has params', () => {
    const decide = (): Action => ({ type: 'pass' });
    expect(botId({ level: 'trained', version: 'net-7', decide })).toBe('trained:net-7');
    expect(botId({ level: 'trained', version: 'net-7', params: 'b32', decide })).toBe('trained:net-7@b32');
    expect(goldenKey({ level: 'trained', version: 'net-7', params: 'b32', decide })).toBe('trained:net-7');
  });

  it('hardPolicy(): Hard is the search at the production budget by default, and the id records the iteration count', () => {
    const p = hardPolicy();
    expect(p.level).toBe('hard');
    expect(p.version).toBe('mcts-1');
    expect(p.params).toBe('160');
    expect(hardPolicy({ iterations: 80 }).params).toBe('80');
    expect(botId(hardPolicy({ iterations: 8, topK: 3 }))).toBe('hard:mcts-1@8');
  });

  it('the uniform-random baseline is random:uniform-1 and picks uniformly among legal actions', () => {
    expect(botId(RANDOM_BOT)).toBe('random:uniform-1');
    const g = createGame({ houses: ['EMBER', 'ORDER'], seed: 12, first: 0 }).state;
    const legal = legalActions(g, 0);
    expect(legal.length).toBeGreaterThan(5);
    const hits = new Map<string, number>();
    const N = 1200;
    for (let i = 0; i < N; i++) {
      const a = RANDOM_BOT.decide(g, 0, { rnd: mulberry(i), know: starter(g, 0) });
      const key = JSON.stringify(a);
      hits.set(key, (hits.get(key) ?? 0) + 1);
    }
    const legalKeys = new Set(legal.map(a => JSON.stringify(a)));
    for (const key of hits.keys()) expect(legalKeys.has(key), `${key} is not a legal action`).toBe(true);
    expect(hits.size, 'every legal action is reachable').toBe(legalKeys.size);
    const pass = hits.get(JSON.stringify({ type: 'pass' })) ?? 0;
    const expected = N / legal.length;
    expect(pass).toBeGreaterThan(expected * 0.6);
    expect(pass).toBeLessThan(expected * 1.5);
  });
});

describe('levels (shared by client and protocol)', () => {
  it('LEVELS is easy, medium, hard in that order; Medium is the default', () => {
    expect([...LEVELS]).toEqual(['easy', 'medium', 'hard']);
    expect(DEFAULT_LEVEL).toBe('medium');
  });

  it('isLevel accepts exactly the three levels', () => {
    for (const ok of ['easy', 'medium', 'hard']) expect(isLevel(ok)).toBe(true);
    for (const bad of ['', 'Easy', 'HARD', 'expert', ' hard', 'hard ', 'toString', 'constructor', '__proto__', 'random', 0, 1, null, undefined, {}, [], ['hard'], true]) {
      expect(isLevel(bad), String(bad)).toBe(false);
    }
  });

  it('every level has a label and a different one-line description', () => {
    const labels = LEVELS.map(l => LEVEL_INFO[l].label);
    expect(labels).toEqual(['Easy', 'Medium', 'Hard']);
    const blurbs = LEVELS.map(l => LEVEL_INFO[l].blurb);
    for (const b of blurbs) expect(b.trim().length).toBeGreaterThan(0);
    expect(new Set(blurbs).size).toBe(3);
  });
});

describe('seeds (rng.ts)', () => {
  const fmix32 = (h: number): number => {
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0;
  };

  it('mulberry moved to rng.ts verbatim: sim.ts still exports the same function and the stream is unchanged', () => {
    expect(simMulberry).toBe(mulberry);
    const r = mulberry(1);
    expect([r(), r(), r()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  it('c8: decisionSeed(botSeed, turnNo) is fmix32(botSeed ^ imul(turnNo + 1, 0x9e3779b1)), so a recorded botSeed replays', () => {
    for (const [botSeed, turnNo] of [[0, 0], [1, 0], [0, 1], [123456789, 17], [0xffffffff, 3], [20261008, 31], [70049, 24]]) {
      expect(decisionSeed(botSeed, turnNo), `(${botSeed}, ${turnNo})`).toBe(fmix32(botSeed ^ Math.imul(turnNo + 1, 0x9e3779b1)));
    }
  });

  it('decisionSeed is a uint32, repeatable, and differs for every turn and every bot seed', () => {
    const seen = new Set<number>();
    for (let turnNo = 0; turnNo < 60; turnNo++) {
      const s = decisionSeed(77, turnNo);
      expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
      expect(decisionSeed(77, turnNo)).toBe(s);
      seen.add(s);
    }
    expect(seen.size, 'turns of one match').toBe(60);
    const bySeed = new Set<number>();
    for (let botSeed = 0; botSeed < 60; botSeed++) bySeed.add(decisionSeed(botSeed, 9));
    expect(bySeed.size, 'bot seeds at one turn').toBe(60);
  });
});

describe('botDecide: the one way a bot move is made', () => {
  const states = midMatchStates(100, 96000);
  const custom = midMatchStates(30, 96500, true);
  const hard4 = hardPolicy({ iterations: 4 });
  const policies: [string, BotPolicy][] = [['easy', BOTS.easy], ['medium', BOTS.medium], ['hard (4 iterations)', hard4], ['random baseline', RANDOM_BOT]];

  it.each(policies)('%s always returns an action the real state accepts (100 starter states and 30 custom-deck states)', (_name, policy) => {
    for (const s of states) {
      const move = botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, s.k));
      expect(validate(s.g, s.me, move.action), `state ${s.k}: ${JSON.stringify(move.action)}`).toBeNull();
      expect(typeof move.guarded).toBe('boolean');
    }
    for (const s of custom) {
      const move = botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, s.k, { oppList: null }));
      expect(validate(s.g, s.me, move.action), `custom-deck state ${s.k}: ${JSON.stringify(move.action)}`).toBeNull();
    }
  });

  it('Hard at its production budget (160 iterations) plays legal moves too', { timeout: 60_000 }, () => {
    for (const s of states.slice(40, 42)) {
      const move = botDecide(BOTS.hard, s.g, s.me, ctxFor(s.g, s.me, s.k));
      expect(validate(s.g, s.me, move.action)).toBeNull();
    }
  });

  it('the action applies on the real state (it names only the bot\'s own hand and board)', () => {
    for (const s of states.slice(0, 40)) {
      const g = structuredClone(s.g);
      const { action } = botDecide(BOTS.medium, g, s.me, ctxFor(g, s.me, s.k));
      expect('error' in applyAction(g, s.me, action)).toBe(false);
    }
  });

  it('c8: throws on a policy that returns an illegal action, and the message names the policy id', () => {
    const s = states[10];
    const cheat: BotPolicy = { level: 'fake', version: 'cheat-1', params: 'x', decide: () => ({ type: 'play', uid: 'no-such-card', row: 'F' }) };
    expect(() => botDecide(cheat, s.g, s.me, ctxFor(s.g, s.me, 1))).toThrow(/fake:cheat-1@x/);
    const broke: BotPolicy = { level: 'fake', version: 'boom-1', decide: () => { throw new Error('policy exploded'); } };
    expect(() => botDecide(broke, s.g, s.me, ctxFor(s.g, s.me, 1))).toThrow(/policy exploded/);
  });

  it('c8: a fake policy plugs in with no other change and its moves are used as they are', () => {
    const s = states[20];
    const firstLegal: BotPolicy = {
      level: 'test', version: 'first-legal-1',
      decide: (view, me) => legalActions(view, me)[1] ?? { type: 'pass' },
    };
    const move = botDecide(firstLegal, s.g, s.me, ctxFor(s.g, s.me, 5));
    expect(validate(s.g, s.me, move.action)).toBeNull();
    const firstPlay = legalActions(s.g, s.me)[1];
    expect(firstPlay, 'the state offers a play').toBeDefined();
    expect(move).toMatchObject({ action: firstPlay, guarded: false });
  });

  it('throws when the match is over or it is not that seat\'s turn', () => {
    const s = states[5];
    expect(() => botDecide(BOTS.medium, s.g, other(s.me), ctxFor(s.g, other(s.me), 1))).toThrow();
    const done = createGame({ houses: ['COVEN', 'EMBER'], seed: 3, first: 0 }).state;
    for (let i = 0; i < 200 && !done.over; i++) {
      const p = done.current;
      const a = legalActions(done, p).at(-1) ?? { type: 'pass' };
      applyAction(done, p, a);
    }
    expect(done.over).toBe(true);
    expect(() => botDecide(BOTS.medium, done, done.current, ctxFor(done, done.current, 1))).toThrow();
  });

  it('c4: a policy gets the shared fair view, never the real state: it is a copy the policy may change freely', () => {
    const playable = states.filter(s => legalActions(s.g, s.me).length > 1);
    expect(playable.length).toBeGreaterThan(80);
    const before = playable.map(s => structuredClone(s.g));
    const meddler: BotPolicy = {
      level: 'spy', version: 'mutate-1',
      decide: (view, me) => {
        const answer = legalActions(view, me)[1] ?? { type: 'pass' };
        view.players[0].hand = [];
        view.players[1].units = [];
        view.players[0].deck.length = 0;
        view.round = 99;
        return answer;
      },
    };
    for (const s of playable) botDecide(meddler, s.g, s.me, ctxFor(s.g, s.me, s.k));
    playable.forEach((s, i) => expect(s.g, `state ${s.k} was changed by the policy`).toEqual(before[i]));
  });

  it('c4: the view is determinize(g, me, ctx.rnd, ctx.know) and the opponent\'s real hidden cards are not in it', () => {
    let compared = 0, differs = 0;
    for (const s of states) {
      const seen: GameState[] = [];
      const spy: BotPolicy = { level: 'spy', version: 'view-1', decide: (view) => { seen.push(view); return { type: 'pass' }; } };
      botDecide(spy, s.g, s.me, ctxFor(s.g, s.me, s.k));
      expect(seen, 'the policy was called once').toHaveLength(1);
      const view = seen[0];
      expect(view).not.toBe(s.g);
      expect(view).toEqual(determinize(s.g, s.me, mulberry(decisionSeed(s.k, s.g.turnNo)), starter(s.g, s.me)));
      const opp = other(s.me);
      if (s.g.players[opp].hand.length >= 4) {
        compared++;
        const real = s.g.players[opp].hand.map(c => c.cardId).sort().join();
        if (view.players[opp].hand.map(c => c.cardId).sort().join() !== real) differs++;
      }
    }
    expect(compared).toBeGreaterThan(40);
    expect(differs / compared, 'the opponent\'s hand in the view differs from the real one').toBeGreaterThan(0.9);
  });

  it('c8 / invariant 1: the only randomness is ctx.rnd (Math.random is never called) for every level', () => {
    const spy = vi.spyOn(Math, 'random');
    for (const [, policy] of policies) {
      for (const s of states.slice(0, 15)) botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, s.k));
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('c8: the same recorded state, bot seed and knowledge reproduce the same action, also after a structured clone (a worker)', () => {
    for (const [name, policy] of policies) {
      for (const s of states.slice(0, 25)) {
        const a = botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, s.k)).action;
        const b = botDecide(policy, s.g, s.me, ctxFor(s.g, s.me, s.k)).action;
        const c = botDecide(policy, structuredClone(s.g), s.me, ctxFor(s.g, s.me, s.k)).action;
        expect(b, `${name}, state ${s.k}`).toEqual(a);
        expect(c, `${name}, state ${s.k} after structuredClone`).toEqual(a);
      }
    }
  });

  it('a different bot seed gives Easy different choices (its randomness really comes from the seed)', () => {
    let differ = 0;
    for (const s of states) {
      const a = botDecide(BOTS.easy, s.g, s.me, ctxFor(s.g, s.me, 1)).action;
      const b = botDecide(BOTS.easy, s.g, s.me, ctxFor(s.g, s.me, 2)).action;
      const c = botDecide(BOTS.easy, s.g, s.me, ctxFor(s.g, s.me, 3)).action;
      if (JSON.stringify(a) !== JSON.stringify(b) || JSON.stringify(a) !== JSON.stringify(c)) differ++;
    }
    expect(differ).toBeGreaterThan(0);
  });

  it('c5 (negative control): the no-throw guard stays out of the way when passing is fine', () => {
    const alwaysPass: BotPolicy = { level: 'fake', version: 'pass-1', decide: () => ({ type: 'pass' }) };
    const fresh = createGame({ houses: ['ECHO', 'COVEN'], seed: 8, first: 0 }).state;
    expect(botDecide(alwaysPass, fresh, 0, ctxFor(fresh, 0, 1))).toMatchObject({ action: { type: 'pass' }, guarded: false });
    const roundOne = states.filter((s: Sample) => s.g.round === 1 && !s.g.players[other(s.me)].passed);
    expect(roundOne.length).toBeGreaterThan(10);
    for (const s of roundOne) {
      expect(botDecide(alwaysPass, s.g, s.me, ctxFor(s.g, s.me, s.k)), `state ${s.k}`).toMatchObject({ action: { type: 'pass' }, guarded: false });
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// c8 golden: each level's decisions on 50 seeded states are committed; a change without a version bump fails the check.
// The golden is written by scripts/bot-golden.ts (`npm run bot-golden`); until it exists these tests fail on purpose.
// Line format: `${seed} ${turnNo} ${JSON action}`. States: goldenState(k) in bot-fixtures.ts.
// Hard is recorded at 16 iterations under its key hard:mcts-1 (the key has no @params).
// ---------------------------------------------------------------------------------------------------------------------
const GOLDEN_PATH = fileURLToPath(new URL('./__golden__/bot-levels.json', import.meta.url));

function loadGolden(): Record<string, string[]> {
  if (!existsSync(GOLDEN_PATH)) {
    throw new Error('shared/__golden__/bot-levels.json does not exist yet: run `npm run bot-golden` to record it (c8 snapshot)');
  }
  const parsed: unknown = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bot-levels.json must be an object keyed by level:version');
  return parsed as Record<string, string[]>;
}

function parseLine(line: string): { seed: number; turnNo: number; action: unknown } {
  const m = /^(\d+) (\d+) (.+)$/.exec(line);
  if (!m) throw new Error(`malformed golden line: ${line}`);
  return { seed: Number(m[1]), turnNo: Number(m[2]), action: JSON.parse(m[3]) };
}

const GOLDEN_POLICIES: [Level, BotPolicy][] = [['easy', BOTS.easy], ['medium', BOTS.medium], ['hard', hardPolicy({ iterations: 16 })]];

describe('c8 golden: decisions on 50 seeded states are committed and only change with a version bump', () => {
  it.each(GOLDEN_POLICIES)('%s: the golden has an entry for the current version', (level, policy) => {
    const golden = loadGolden();
    const key = goldenKey(BOTS[level]);
    expect(goldenKey(policy)).toBe(key);
    expect(Object.keys(golden), `no golden entry for ${key}: run \`npm run bot-golden\` (a new version records a new entry)`).toContain(key);
    expect(golden[key]).toHaveLength(GOLDEN_STATES);
  });

  it('golden keys are level:version without @params', () => {
    for (const key of Object.keys(loadGolden())) expect(key, key).toMatch(/^[a-z]+:[A-Za-z0-9._-]+$/);
  });

  it.each(GOLDEN_POLICIES)('%s: all 50 decisions equal the committed golden', { timeout: 60_000 }, (level, policy) => {
    const golden = loadGolden();
    const key = goldenKey(BOTS[level]);
    const entry = golden[key];
    if (!entry) throw new Error(`no golden entry for ${key}: run \`npm run bot-golden\``);
    const stateDiffs: string[] = [];
    const decisionDiffs: string[] = [];
    for (let k = 0; k < GOLDEN_STATES; k++) {
      const g = goldenState(k);
      const want = parseLine(entry[k]);
      if (want.seed !== GOLDEN_SEED + k || want.turnNo !== g.turnNo) {
        stateDiffs.push(`#${k}: golden is for seed ${want.seed} turn ${want.turnNo}, the state is seed ${GOLDEN_SEED + k} turn ${g.turnNo}`);
        continue;
      }
      const { action } = botDecide(policy, g, g.current, ctxFor(g, g.current, k));
      const got = JSON.parse(JSON.stringify(action)) as unknown;
      if (JSON.stringify(got) !== JSON.stringify(want.action) && !deepEqual(got, want.action)) {
        decisionDiffs.push(`#${k} (seed ${GOLDEN_SEED + k}, turn ${g.turnNo}): golden ${JSON.stringify(want.action)}, now ${JSON.stringify(got)}`);
      }
    }
    expect(stateDiffs, `${key}: the golden was recorded on different states than goldenState() in bot-fixtures.ts builds`).toEqual([]);
    const hint = decisionDiffs.length > GOLDEN_STATES / 2
      ? ' Most lines differ: the golden was probably recorded on other states than goldenState() in bot-fixtures.ts builds (scripts/bot-golden.ts must use that function).'
      : '';
    expect(decisionDiffs, `${key}: ${decisionDiffs.length} of ${GOLDEN_STATES} decisions changed. If the change is intended, bump the version of "${level}" and run \`npm run bot-golden\`; if not, fix the regression.${hint}`).toEqual([]);
  });
});

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
