# Backlog

Seeded from the CTO code review of Oct 6, 2026 (commit 762c1c4); the review findings first left out were added the same day. Statuses: todo / spec / building / review / done.
Phase 0 goes first: the agent team is only as good as the gates that check its work.

## Demo MVP - public demo vs the bot (link goes public Tue Oct 13)
Spec and design: docs/specs/demo-mvp.md. Feature PRs don't edit this file; the orchestrator updates the statuses.

| PR | Items | Status |
| --- | --- | --- |
| 1 Test gates | T1, T4, T2 | done ([#1](https://github.com/Anh1264/afterlight/pull/1), merged Oct 7); Railway's Wait for CI is Aiden's switch |
| 2a Server hardening | P0-1, N4, DM-2, DM-8 | review (built; check and both browser tests green) |
| 2b Abuse limits and logs | P0-4, DM-6 | spec |
| 3 Bot Round 1 and card text | DM-1, DM-3 | build (review cycle 1 fixes in progress) |
| 4 Truth on screen and the demo surface | P0-3, DM-4 | review (#3) |
| 5 Phones, link preview and recovery | DM-5, DM-7, C4 | tests first |

| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| DM-1 | bot | S | The bot wins Round 1 against an immediate pass in at least 98% of 2,000 seeds (85% when the human plays their strongest card first) (it concedes 55.8% today), and judges who is ahead with the engine's totals, First Light included (bot.ts uses raw `score()`). | build |
| DM-2 | server | S | No turn clock in bot matches: today a 60 s timeout passes the whole round while a newcomer reads their hand. Idle bot matches end after 15 minutes instead. | review |
| DM-3 | engine | S | Card text matches the engine for Drake-07 and Lattice (Legends in the Echo starter), plus Replicator, Afterimage and Wire Hound, found during the build. Text only, plus their README rows and the Echo keyword tooltip match. | build |
| DM-4 | client | M | Demo surface: Play vs Bot is the only home action (PvP at `/?pvp=1`), deck builder hidden, no ART PENDING, PLAYTEST label, How to play on the first click, Give feedback link, rules numbers from shared constants. | review (#3) |
| DM-5 | client | S | Phones and tablets get a "made for desktop" screen (Copy link, Try anyway, no art preload). Link-preview tags (og/twitter), a fullscreen button, and the device class sent in the socket handshake. | tests first |
| DM-6 | server | S | One single-line JSON log per funnel event (no tokens, IPs or names). Build SHA and since-boot counters on `/health`. | spec |
| DM-7 | client | M | Recovery: "the server restarted and your match was lost" instead of the invite/expired screen, "Can't reach the server. Retrying...", and a message for matches the server ended (error or idle). | spec |
| DM-8 | server | S | Bot rooms play starter decks only, enforced by the server: `lobby:deck` is rejected in bot rooms (today it accepts any legal custom deck). | spec |

## Phase 0 - gates for the team
| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| T1 | tooling | M | Install vitest and Playwright. Port engine.test.ts to vitest. Add e2e/ helpers (start server, play a bot match, open /cards). `npm run check` = typecheck + vitest + fuzz-lite; `npm run e2e` separately. | done |
| T2 | ops | S | GitHub Actions on push/PR: check + e2e + `npm audit --omit=dev`. Railway deploys only after CI is green. | review |
| T4 | tooling | S | Split shared/simulate.ts into a library and a CLI. Today importing `randomDeck` runs the full 700-match simulation at import time. Needed for T1's fuzz-lite. | done |
| T5 | tooling | S | Install ESLint and enforce the CLAUDE.md conventions (no `any`, no non-null assertions, no empty `catch`). The code already has `eslint-disable` comments for a linter that isn't installed. | todo |

## P0 - before any promotion
| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| P0-1 | server | S | Validate every socket payload with zod, tolerate a missing ack, try/catch every handler. Today `game:action` without an ack, or a `null` action, crashes the process (reproduced). | spec |
| P0-2 | ops | S | Push local main: it is 2 commits ahead of GitHub, so Railway still serves v0.2. (Aiden, from his terminal.) Pushed; Railway's production deploy of e44a92e succeeded on Oct 6. | done |
| P0-3 | client | S | Client hard-codes First Light +1; the engine uses +2 (`RULES.FIRST_LIGHT`). Use shared `totals()` in Game.tsx:193-194 and fix the chip (Game.tsx:285) and rules copy (Screens.tsx:64). The pass button can promise WIN on a tie. | spec |
| P0-4 | server | S | One room per socket; release the old seat on attach; rate-limit room:create; check `seat.socketId === socket.id` on game events. One socket created 20,000 rooms in 2.5 s; rooms held by dead sockets are never swept. | spec |
| B1 | client | S | Reported by Aiden: Back on the All Cards page leaves the site when /cards was opened directly. Cause: App.tsx `onBack` uses `history.length > 1`, which counts pages from before the app. Back should go to Home unless the previous entry is ours. | todo |

## P1 - make it launchable
| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| O2 | server | L | SIGTERM drain, then persist live matches as (seed, decks, actions) and rehydrate on boot. Today every deploy kills every live match. | todo |
| D1 | data | M | Postgres match log (players, matches, match_players, match_actions, events) with an anonymous player id and build SHA. Foundation for balance analytics. | todo |
| E1 | engine | L | Typed effect registry: one definition per effect (target, apply, generated text). Migrate the 43 legacy ids. Fix text drift on Drake-07, Lattice, Hacker. | todo |
| A1 | arch | M | Self-describing events (carry post-state); director applies instead of re-implementing rules; replay-consistency test. | todo |
| O3 | ops | M | Structured logs (pino), Sentry on server and client, build SHA in /health and the client footer. | todo |
| T3 | test | M | Per-card tests for all 108 cards; card-conservation invariant in the fuzzer; core Playwright flows committed. | todo |
| C1 | client | L | Mobile: tap-to-inspect, rotate prompt, responsive board for 844x390. Today the fixed 1600x900 stage renders 13 px text at about 5.6 px on a phone. | todo |
| C2 | client | S | Asset diet: preload only the two houses in the match; particle sheets under 80 KB; immutable caching for hashed /assets. Today 8.15 MB preloads on the home screen. | todo |
| N1 | server | M | Quick-match queue with bot fallback, so strangers from promotion can find a game. | todo |
| E2 | engine | M | Targets are validated against one board and resolved against another: `validate()` builds the target spec before the unit lands, then `doPlay()` applies Rally and Echo before `applyEffect()`. Re-picking effects (burnstrongest, sacburn, afterimage) can see a board the player was never shown. No current card breaks; the first Rally card with a power-capped ally target will. | todo |
| E3 | engine | S | Apply each action to a clone and commit on success (structuredClone of the 2.1 KB state is about 43 µs). Today an exception mid-effect leaves a half-applied GameState that the server keeps serving. Remove the catch-and-skip in `bestPlay` (bot.ts:74) so engine crashes fail tests instead of weakening the bot. | todo |
| G2 | bot | M | Bot policy: one-move greedy with hand-tuned constants and random passes; it splits rounds in 98% of bot-vs-bot games. Exploitable by humans, and it skews the sim's balance numbers. | todo |
| N4 | server | S | Process safety net: log `uncaughtException` and `unhandledRejection` (today any missed bug is fatal and silent). Validation (P0-1) stays the real fix. | spec |
| C4 | client | S | React error boundary with a reload action. Today any render exception shows a blank white screen and nobody hears about it. | spec |

## P2 - after real traffic
| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| N3 | server | S | Turn clock: send remaining ms instead of an absolute epoch; start it on the client's "animation done" ack, with a server cap. | todo |
| C3 | client | M | Split Game.tsx: selection reducer with tests, sliced director state, memoised units. Profile on a low-end phone first. | todo |
| G1 | data | M | Balance method: 2,000+ games per matchup with confidence intervals, a varied-deck sim, a dashboard on human data. | todo |
| O4 | ops | S | Compile the server with esbuild and run plain node; fix the dependencies / devDependencies split. | todo |
| E4 | engine | S | Assign card uids after the shuffle, not in decklist order (engine.ts:115). Safe today because unplayed uids never leave the server; it becomes a hidden-information leak the day an event exposes one. | todo |
| N5 | server | S | Rematch dead code: `sendGame(room, [])` runs right after `room.game = null`, so it returns immediately. | todo |
| N6 | server | S | CORS is `origin: true` (server/index.ts:63): restrict it to our own domain. Low risk (no cookie auth). | todo |
| N7 | design | S | A turn timeout passes the whole round, not just the turn. Decide this on purpose (game-designer), especially while the clock's start time is a guess (N3). | todo |
| N8 | server | M | Split `server/app.ts` (524 lines after PR 2a) into rooms, handlers and timers once the demo is over; plan it with the architect. Found in the PR 2a review. | todo |
| C5 | client | S | Art files aren't content-hashed and are served with `maxAge: '1h'`, so a replaced portrait stays stale for up to an hour. Cache-bust art (for example a hash in the manifest). Pairs with C2's immutable /assets. | todo |
| C6 | client | S | Client hygiene: remove `ds.shown!` non-null assertions, replace the native `confirm()` forfeit dialog, clean up per-room `al:t:<code>` token keys that pile up in localStorage. | todo |
| C7 | client | M | Accessibility: keyboard play, focus states, ARIA labels, and houses told apart by more than colour. | todo |
| C8 | client | S | The `.game` root is keyed on the shake counter (Game.tsx:260), so every hit of 4 or more remounts the whole board: framer-motion state resets and the hand's entry animation replays. Shake a wrapper or use an animation instead of a key change. Found in the PR 1 review. | todo |
| C9 | client | S | Rules numbers still hard-coded outside PR 4's files: Gallery.tsx:7 and :19 ("MAX 1/2/3", "Legend ×1, Rare ×2, Common ×3") should read `DECK_RULES`, and Game.tsx "WAITING 60s" repeats the server's drop grace (PvP only). Found in the PR 4 review. | todo |
| C10 | client | S | First Light is hard to see: at 1366x650 the divider chip renders at about 8 px in dim grey, so the holder's total is 2 more than its rows add up to with no visible reason. Show the bonus next to the holder's total in Round 1, or make the chip legible. Found in the PR 4 ux pass. | todo |
| C11 | client | S | The first-visit How to play shows 17 keywords at about 10 px beside the 5 steps: a wall of text for a first impression. Consider showing only the steps there and pointing to the in-game "Rules & keywords". Found in the PR 4 ux pass. | todo |
| C12 | client | S | At inner 1366x650 the hand cards are clipped at the bottom of the stage (names readable, ability text cut). Check at Friday's ux pass; fix if a card's text can't be read on hover. Found in the PR 4 ux pass. | todo |
| C13 | client | S | When the pass button reads PASS · WIN MATCH, the hint above the hand still says "Pass to take the round, or keep building". Say "match" when passing ends the match (Game.tsx `prompt`). Found in the PR 4 final ux pass. | todo |
| E5 | engine | S | engine.ts:104 seeds with `Math.random` when no seed is passed, a gap against invariant 1 (determinism). Require a seed, or move the default to the server. Found in the demo design challenge. | todo |
| E6 | engine | S | Null-9 and Puppeteer text leaves out what seize does at the edges: the taken unit loses Poison, and moves to the other row when its own row is full (engine.ts:555-565). Afterimage does not say which unit it copies when two are tied for strongest (the engine takes the one that reached the board first, engine.ts:542), which decides the Echo’s row. Text only. Found by game-designer during PR 3. | todo |
| O5 | ops | M | Staging environment: a Railway environment that deploys from a `staging` branch. Today production is the only place the full stack runs. | todo |
| O6 | ops | S | Version releases: package.json still says 0.1.0 and there are no git tags. Tag each deploy (pairs with the build SHA in O3). | todo |
| O7 | ops | S | Bump `concurrently` (2 critical audit issues in `shell-quote`, dev-only). | todo |
