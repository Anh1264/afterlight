# shared/ - rules engine rules

- `engine.ts` is pure: `applyAction(state, player, action)` validates, mutates the given state, returns events. No I/O, Date or Math.random; use `rand(g)`.
- Events are the contract with the client. Adding or changing an event type means updating client/src/director.ts in the same PR, and the event should carry the post-state of what it touches.
- Effects are currently strings dispatched in three places: `targetSpecFor()`, `applyEffect()` and `lastWords()`. Any new effect must be handled in all that apply. Backlog E1 replaces this with a typed registry; don't add new one-off effect names (use the `name:arg` grammar).
- Card text (`text` in cards.ts) must match behaviour exactly. Watch the any-row placement rule: effects that say "Front row" must not depend on where the unit was placed unless the text says so.
- Starter decks (`STARTERS`) are balance-tuned; changing them needs a game-designer sim report.
- Tests: vitest (`*.test.ts` next to the code). Use createGame with a fixed seed and `first`. `sim.ts` is the side-effect-free simulator library (fuzz-lite in `fuzz.test.ts` runs on every `npm run check`); `simulate.ts` is only the `npm run sim` CLI.
