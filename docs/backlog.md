# Backlog

Seeded from the CTO code review of Oct 6, 2026 (commit 762c1c4). Statuses: todo / spec / building / review / done.
Phase 0 goes first: the agent team is only as good as the gates that check its work.

## Phase 0 - gates for the team
| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| T1 | tooling | M | Install vitest and Playwright. Port engine.test.ts to vitest. Add e2e/ helpers (start server, play a bot match, open /cards). `npm run check` = typecheck + vitest + fuzz-lite; `npm run e2e` separately. | todo |
| T2 | ops | S | GitHub Actions on push/PR: check + e2e + `npm audit --omit=dev`. Railway deploys only after CI is green. | todo |

## P0 - before any promotion
| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| P0-1 | server | S | Validate every socket payload with zod, tolerate a missing ack, try/catch every handler. Today `game:action` without an ack, or a `null` action, crashes the process (reproduced). | todo |
| P0-2 | ops | S | Push local main: it is 2 commits ahead of GitHub, so Railway still serves v0.2. (Aiden, from his terminal.) | todo |
| P0-3 | client | S | Client hard-codes First Light +1; the engine uses +2 (`RULES.FIRST_LIGHT`). Use shared `totals()` in Game.tsx:193-194 and fix the chip (Game.tsx:285) and rules copy (Screens.tsx:64). The pass button can promise WIN on a tie. | todo |
| P0-4 | server | S | One room per socket; release the old seat on attach; rate-limit room:create; check `seat.socketId === socket.id` on game events. One socket created 20,000 rooms in 2.5 s; rooms held by dead sockets are never swept. | todo |
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

## P2 - after real traffic
| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| N3 | server | S | Turn clock: send remaining ms instead of an absolute epoch; start it on the client's "animation done" ack, with a server cap. | todo |
| C3 | client | M | Split Game.tsx: selection reducer with tests, sliced director state, memoised units. Profile on a low-end phone first. | todo |
| G1 | data | M | Balance method: 2,000+ games per matchup with confidence intervals, a varied-deck sim, a dashboard on human data. | todo |
| O4 | ops | S | Compile the server with esbuild and run plain node; fix the dependencies / devDependencies split. | todo |
