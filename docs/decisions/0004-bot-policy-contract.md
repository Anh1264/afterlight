# 0004 - Bot policy contract: fair-by-construction harness, versioned ids, per-decision seeds

Date: 2026-10-08    Status: proposed    Deciders: Aiden + architect (applied defaults while Aiden was away; Aiden may overturn)

## Context
docs/specs/bot-levels.md adds Easy, Medium and Hard and promises a trained bot "behind the same interface". Three things become hard to reverse once rows exist:
- the bot id string written to logs today and to `match_records.bot_version` (data-platform 2b) later: every stat per bot is grouped by it;
- what a policy is allowed to see: today both bots read the real GameState (bot.ts:74-75, bot-mcts.ts:41-50 and :69), so fairness depends on each policy's author;
- where a policy's randomness comes from: a stateful `rnd` closure cannot cross a worker_thread boundary (BL-2) and makes a decision depend on the whole match history, so one recorded state cannot reproduce one decision.
Invariant 1 (pure, deterministic shared/) and the spec's c4 (fair play) and c8 (versioned, pluggable) are involved.

## Options
1. **Each policy determinizes itself** (data-platform 3e as written: `decide` calls `determinize`). For: no new harness. Against: fairness is per-author; a trained bot or a hurried fix can read `g.players[opp].hand` and nothing stops it except a property test written per policy.
2. **The harness determinizes, the policy never sees the real state.** `botDecide(policy, g, me, ctx)` builds one fair view with the shared `determinize` and calls `policy.decide(view, me, ctx)`. For: fair by construction for every present and future policy, one property test (c4) covers all of them; Medium needs no wrapper. Against: one extra `structuredClone` per decision (about 43 µs, backlog E3), and Hard re-determinizes the view rather than the real state (same distribution, since the view's hidden zones are already a uniform sample).
3. **Policies receive only an `Observation`** (data-platform 3c `observe()`). For: the strictest contract, matches the trained bot. Against: Medium and Hard need a full GameState to simulate; they would rebuild one from the Observation, which is `determinize` again with more code.

## Objections that mattered
- "Discards are hidden in `viewFor` (engine.ts:713-723 sends only counts), so keeping the opponent's discard in the view leaks." Every card in a discard was revealed by a `play` or `destroy` event except a card burned by a full hand (engine.ts:132), which data-platform R9 already accepts. Keeping discards lets the bot remember what was played, as an attentive human does.
- "A time-budgeted search (think until 1.2 s) would adapt to Railway's CPU." It makes a decision depend on the clock, which breaks c4, c8's snapshot and replay of a ladder match. Rejected for shared/; the budget is an iteration count carried in the bot id.

## Decision
Option 2.
- `BotPolicy { level, version, params?, decide(view, me, ctx) }`; the id written everywhere is `level:version[@params]`, for example `easy:heur-easy-1`, `medium:heur-2`, `hard:mcts-1@160`. `heur-1` names today's leaky Level 1 bot, so pre-BL rows stay distinguishable.
- `ctx.rnd` is built by the caller from `decisionSeed(botSeed, g.turnNo)` (shared/rng.ts), so one (state, botSeed, knowledge, id) reproduces one decision, in a worker or not.
- `ctx.know.oppList` is the opponent's public list (starter or premade) or `null` for a custom deck, in which case the hidden cards are sampled from the house pool.
- A version changes whenever a decision on the committed 50-state golden changes (shared/__golden__/bot-levels.json); the golden is keyed by `level:version` without `@params`, so retuning Hard's iteration count changes the id but not the golden.

| Option | Player impact | Risk | Effort | Reversibility | Invariant fit |
| --- | --- | --- | --- | --- | --- |
| 1 Per-policy determinize | 3 | 2 | 4 | 3 | 3 |
| 2 Harness determinizes | 4 | 4 | 4 | 4 | 5 |
| 3 Observation only | 4 | 3 | 2 | 3 | 5 |

## Revisit if
- ISMCTS or a trained bot needs information sets rather than a single sampled world (then the policy gets the view plus `know` and samples its own worlds, which this contract already allows);
- custom decks reach bot rooms (CV-4) and the house-pool sampler measurably weakens Hard (ladder rerun with random legal decks);
- the rules make hand-overflow burns visible, which removes the one known leak.
