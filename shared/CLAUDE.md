# shared/ - rules engine rules

- `engine.ts`: `applyAction(state, player, action)` validates, mutates the given state and returns events. Randomness only through `rand(g)`.
- Events are the contract with the client: adding or changing an event type updates client/src/director.ts in the same PR, and the event carries the post-state of what it touches.
- Card text trap (`text` in cards.ts): an effect that says "Front row" must not depend on where the unit was placed unless the text says so (any-row placement).
- Starter decks (`STARTERS`) are balance-tuned; changing them needs a game-designer sim report.
- Tests: vitest `*.test.ts` next to the code, built with createGame, a fixed seed and `first`. `sim.ts` is the side-effect-free simulator library (fuzz-lite in `fuzz.test.ts` runs in every `npm run check`); `simulate.ts` is only the `npm run sim` CLI.
- Effects are strings dispatched in `targetSpecFor()`, `applyEffect()` and `lastWords()`; handle a new effect in every one that applies. Use the `name:arg` grammar, no new one-off effect names (backlog E1 replaces this with a typed registry).
