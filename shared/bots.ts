// The bot contract: versioned policies, the fair harness that is the only way a bot move is made, and the registry.
// A policy never sees the real GameState: botDecide builds the fair view with the shared determinize and hands the policy
// only that. Design: docs/specs/bot-levels.md section 3; ADR docs/decisions/0004-bot-policy-contract.md.
import { Action, GameState, PIdx, validate } from './engine';
import { bestPlay, decide, legalActions, passThrowsMatch } from './bot';
import { decideEasy } from './bot-easy';
import { HARD_ITERATIONS, MCTS_VERSION, MctsOptions, searchMcts } from './bot-mcts';
import { DeckKnowledge, determinize } from './determinize';
import { Level } from './levels';

export interface BotContext {
  /** The only randomness a policy may use; built by the caller from decisionSeed(botSeed, g.turnNo). */
  readonly rnd: () => number;
  readonly know: DeckKnowledge;
}

export interface BotPolicy {
  /** A Level in BOTS; anything else for baselines, fakes and the trained bot ('random', 'test', 'trained'). */
  readonly level: string;
  /** Bump whenever its golden decisions change. */
  readonly version: string;
  /** Strength config that is not the algorithm, e.g. '160' iterations. */
  readonly params?: string;
  /** `view` is already fair (determinize) and is the policy's own copy; it may mutate it. */
  decide(view: GameState, me: PIdx, ctx: BotContext): Action;
}

/** `guarded`: the no-throw guard replaced a pass. */
export interface BotMove { action: Action; guarded: boolean }

/** The id written to logs and, later, to match_records.bot_version: `level:version`, plus `@params` when there are any. */
export function botId(p: BotPolicy): string {
  return `${p.level}:${p.version}${p.params ? `@${p.params}` : ''}`;
}

/** The key in shared/__golden__/bot-levels.json: `level:version`, without params, so retuning Hard's budget keeps the golden. */
export function goldenKey(p: BotPolicy): string {
  return `${p.level}:${p.version}`;
}

/** Hard: the determinized search at `opts.iterations` (default HARD_ITERATIONS); the id records the iteration count. */
export function hardPolicy(opts: Partial<MctsOptions> = {}): BotPolicy {
  const iterations = opts.iterations ?? HARD_ITERATIONS;
  return {
    level: 'hard',
    version: MCTS_VERSION,
    params: String(iterations),
    decide: (view, me, ctx) => searchMcts(view, me, ctx.rnd, ctx.know, { ...opts, iterations }).action,
  };
}

export const BOTS: Readonly<Record<Level, BotPolicy>> = {
  easy: { level: 'easy', version: 'heur-easy-1', decide: (view, me, ctx) => decideEasy(view, me, ctx.rnd) },
  // 'heur-1' names the pre-BL bot that read the real state; heur-2 is the same decide() on the fair view
  medium: { level: 'medium', version: 'heur-2', decide: (view, me, ctx) => decide(view, me, ctx.rnd) },
  hard: hardPolicy(),
};

/** Uniform over the legal actions (pass included): the ladder's floor, not a level. */
export const RANDOM_BOT: BotPolicy = {
  level: 'random',
  version: 'uniform-1',
  decide: (view, me, ctx) => {
    const legal = legalActions(view, me);
    return legal[Math.floor(ctx.rnd() * legal.length)];
  },
};

/** The only way a bot move is made. Throws if g is over, it is not me's turn, or the policy's action fails validate() on g. */
export function botDecide(p: BotPolicy, g: Readonly<GameState>, me: PIdx, ctx: BotContext): BotMove {
  if (g.over) throw new Error(`botDecide(${botId(p)}): the match is over`);
  if (g.current !== me) throw new Error(`botDecide(${botId(p)}): it is not seat ${me}'s turn`);
  const view = determinize(g, me, ctx.rnd, ctx.know);
  let action = p.decide(view, me, ctx);
  let guarded = false;
  // no thrown matches: a pass that loses the match is replaced by the best-scoring play of the bot's own view
  if (action.type === 'pass' && passThrowsMatch(view, me)) {
    const best = bestPlay(view, me);
    if (best) { action = best.play; guarded = true; }
  }
  // actions name only the bot's own hand and board uids, which the view leaves unchanged, so they apply to the real g
  const err = validate(g, me, action);
  if (err !== null) throw new Error(`botDecide(${botId(p)}): illegal action ${JSON.stringify(action)}: ${err}`);
  return { action, guarded };
}
