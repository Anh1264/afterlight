# Backlog

Seeded from the CTO code review of Oct 6, 2026 (commit 762c1c4); the review findings first left out were added the same day. Statuses: todo / spec / building / review / done.
Work goes by milestone, not date (Aiden, Oct 7): a milestone is done when its exit criteria hold. Sizes follow CLAUDE.md "Sizing".

## Milestone 1 - Team v2: cheaper, checked work
From Aiden's agent-architecture-v2 proposal (Oct 7). Exit: the first S bug after AG-1 to AG-3 lands takes about 45 minutes and 10M tokens or less end to end (orchestrator plus agents, from the session logs), and every AG-6 check fails on a deliberately bad commit and passes on main.

| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| AG-1 | team | S | One fresh worktree session per item; the orchestrator never carries two items and trusts agent returns. Aiden-reported bugs are triaged the same turn. | review |
| AG-2 | team | S | Review depth by size: S reviews on Sonnet (diff, check, one revert), M/L full; cycle 2 is a delta review. /bug: one Sonnet dev writes the repro test then the fix; review and UX check run in parallel; S runs only the affected e2e specs (CI runs all). Sizing by risk and open decisions. | review |
| AG-3 | team | S | ux-reviewer screenshot budget (S 6, M 20, /ux-pass 40), Read only the ones judged, and arrive at each changed screen by direct URL, reload and Back/Forward. | review |
| AG-7 | team | S | code-reviewer returns an "Enforce mechanically" line; the orchestrator files each one under this milestone. | review |
| AG-6 | tooling | M | Invariants become CI failures, all in ESLint (absorbs T5): `no-explicit-any`, `no-non-null-assertion`, `no-empty`; import boundaries (shared/ imports nothing from server/ or client/, server/ nothing from client/); engine purity (`Date`, `Math.random`, Node I/O banned in shared/engine via `no-restricted-globals` / `-properties` / `-imports`). Plus a fuzz test that `viewFor()` output never holds the opponent's hand, the deck order or the seed. Mark each enforced invariant "(CI)" in CLAUDE.md. Accept: each rule fails on a deliberately bad commit. | todo |
| AG-5 | e2e | S | One stable-wait helper in e2e/helpers.ts: fonts loaded, animations idle (`document.getAnimations()`), and layout settled (an element's box unchanged across two frames: the C12 flake was the back row sliding, not an animation). Every spec waits on it before asserting or taking a screenshot. Accept: `npm run e2e` passes 10 runs in a row. | todo |
| AG-4 | client | M | Route table as the verification map: one typed table in client/ (each screen, its URL, how a player can arrive, where its exits go). App.tsx navigates through it with one `navigate()` helper; ESLint bans raw `history.*` elsewhere (B1's cause). e2e helpers import the table, and one generated spec opens every route by direct URL and reload and checks that every Back/Home control stays on the site. Accept: a new route gets that coverage without writing a test. | todo |
| AG-10 | tooling | S | Size check in CI: a script lists the areas and protected paths a PR touches (shared/protocol.ts, persistence, the effect system, viewFor) and flags a PR body that says "Size: S" but touches an L surface or two areas. | todo |
| T6 | e2e | S | Flake: server-ended.spec.ts:58 (c7 FAIL_BOT_TURN=1) timed out at :70 waiting 30 s for the "Something went wrong" message on PR #14's CI run 37590988918, a docs-only PR. The same code passed on #13's run. Unknown cause, so first a capped investigation (the error-context and trace from a failing run; the pass-until-the-bot-acts poll), then size it. Cause: `isMyTurn` waited with no timeout for a Pass button that was gone once the match ended. | done ([#15](https://github.com/Anh1264/afterlight/pull/15)) |
| AG-11 | tooling | S | From the C27 review: a vitest that fails on new 1600-layout hard-codes in client/src/styles.css (a `left:` or `width:` of 900px or more in game/home rules without a `/* fixed */` marker). Add 3440x1440 (the 2100 cap) to fill-screen.spec.ts. | todo |
| AG-8 | team | S | Eval set for agent changes: docs/evals/agents.md with 3 fixed past tasks (B1, a server change like 2a, a UX check) and rubrics; a PR that changes .claude/ or CLAUDE.md runs them on its branch and on main and reports pass/fail, tokens and minutes. After Milestone 2, once there are runs to compare; check that `claude -p --agent` works first. | todo |

Rejected: AG-9 (a Haiku chores agent). AG-1 removes the cost of backlog updates, and README card tables should be an npm script.

## Milestone 2 - Finish the demo MVP
Exit: a desktop visitor can open the public link, learn the rules, finish a match against the bot and give feedback. B2 and B3 are the first runs of the new /bug pipeline, measured against Milestone 1's exit.
- Aiden: the feedback form URL for the Give feedback link.
- B2, B3 (below).

## Milestone 3 - E1, the typed effect registry
The main "shortest path is the right path" case: today a new effect is handled in three places. A `Record<EffectKind, Handler>` makes a missing handler a type error, and rules text is generated from the definition (invariant 5). Item E1 under P1.

## Demo MVP - public demo vs the bot
Spec and design: docs/specs/demo-mvp.md. Feature PRs don't edit this file; the orchestrator updates the statuses.

| PR | Items | Status |
| --- | --- | --- |
| 1 Test gates | T1, T4, T2 | done ([#1](https://github.com/Anh1264/afterlight/pull/1), merged Oct 7); Railway's settings confirmed by Aiden |
| 2a Server hardening | P0-1, N4, DM-2, DM-8 | done ([#4](https://github.com/Anh1264/afterlight/pull/4), merged Oct 7) |
| 2b Abuse limits and logs | P0-4, DM-6 | done ([#5](https://github.com/Anh1264/afterlight/pull/5), merged Oct 7) |
| 3 Bot Round 1 and card text | DM-1, DM-3 | done ([#9](https://github.com/Anh1264/afterlight/pull/9), merged Oct 7) |
| 4 Truth on screen and the demo surface | P0-3, DM-4 | done ([#3](https://github.com/Anh1264/afterlight/pull/3), merged Oct 7) |
| 5 Phones, link preview and recovery | DM-5, DM-7, C4 | done ([#10](https://github.com/Anh1264/afterlight/pull/10), merged Oct 7) |
| 6 Readable cards in a match | C12 | done ([#12](https://github.com/Anh1264/afterlight/pull/12), merged Oct 7) |

| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| DM-1 | bot | S | The bot wins Round 1 against an immediate pass in at least 98% of 2,000 seeds (85% when the human plays their strongest card first) (it concedes 55.8% today), and judges who is ahead with the engine's totals, First Light included (bot.ts uses raw `score()`). | done (#9) |
| DM-2 | server | S | No turn clock in bot matches: today a 60 s timeout passes the whole round while a newcomer reads their hand. Idle bot matches end after 15 minutes instead. | done (#4) |
| DM-3 | engine | S | Card text matches the engine for Drake-07 and Lattice (Legends in the Echo starter), plus Replicator, Afterimage and Wire Hound, found during the build. Text only, plus their README rows and the Echo keyword tooltip match. | done (#9) |
| DM-4 | client | M | Demo surface: Play vs Bot is the only home action (PvP at `/?pvp=1`), deck builder hidden, no ART PENDING, PLAYTEST label, How to play on the first click, Give feedback link, rules numbers from shared constants. | done (#3) |
| DM-5 | client | S | Phones and tablets get a "made for desktop" screen (Copy link, Try anyway, no art preload). Link-preview tags (og/twitter), a fullscreen button, and the device class sent in the socket handshake. | done (#10) |
| DM-6 | server | S | One single-line JSON log per funnel event (no tokens, IPs or names). Build SHA and since-boot counters on `/health`. | done (#5) |
| DM-7 | client | M | Recovery: "the server restarted and your match was lost" instead of the invite/expired screen, "Can't reach the server. Retrying...", and a message for matches the server ended (error or idle). | done (#10) |
| DM-8 | server | S | Bot rooms play starter decks only, enforced by the server: `lobby:deck` is rejected in bot rooms (today it accepts any legal custom deck). | done (#4) |

## Phase 0 - gates for the team
| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| T1 | tooling | M | Install vitest and Playwright. Port engine.test.ts to vitest. Add e2e/ helpers (start server, play a bot match, open /cards). `npm run check` = typecheck + vitest + fuzz-lite; `npm run e2e` separately. | done |
| T2 | ops | S | GitHub Actions on push/PR: check + e2e + `npm audit --omit=dev`. Railway deploys only after CI is green. | done (#1) |
| T4 | tooling | S | Split shared/simulate.ts into a library and a CLI. Today importing `randomDeck` runs the full 700-match simulation at import time. Needed for T1's fuzz-lite. | done |
| T5 | tooling | S | Install ESLint and enforce the CLAUDE.md conventions (no `any`, no non-null assertions, no empty `catch`). The code already has `eslint-disable` comments for a linter that isn't installed. | moved into AG-6 |

## P0 - before any promotion
| ID | Area | Size | Item | Status |
| --- | --- | --- | --- | --- |
| P0-1 | server | S | Validate every socket payload with zod, tolerate a missing ack, try/catch every handler. Today `game:action` without an ack, or a `null` action, crashes the process (reproduced). | done (#4) |
| P0-2 | ops | S | Push local main: it is 2 commits ahead of GitHub, so Railway still serves v0.2. (Aiden, from his terminal.) Pushed; Railway's production deploy of e44a92e succeeded on Oct 6. | done |
| P0-3 | client | S | Client hard-codes First Light +1; the engine uses +2 (`RULES.FIRST_LIGHT`). Use shared `totals()` in Game.tsx:193-194 and fix the chip (Game.tsx:285) and rules copy (Screens.tsx:64). The pass button can promise WIN on a tie. | done (#3) |
| P0-4 | server | S | One room per socket; release the old seat on attach; rate-limit room:create; check `seat.socketId === socket.id` on game events. One socket created 20,000 rooms in 2.5 s; rooms held by dead sockets are never swept. | done (#5) |
| B1 | client | S | Reported by Aiden: Back on the All Cards page leaves the site when /cards was opened directly. Cause: App.tsx `onBack` uses `history.length > 1`, which counts pages from before the app. Back should go to Home unless the previous entry is ours. The label names the destination: "← Home" or "← Back to lobby". | done ([#13](https://github.com/Anh1264/afterlight/pull/13), merged Oct 7) |
| B2 | client | S | If a match ends (`onEnded`) while the gallery is open, `home()` (App.tsx:155) doesn't clear `gallery`, so the gallery reappears at `/`. Needs an in-game end while on /cards, so it's unlikely. Found in the B1 code review. | todo |
| B3 | client | S | A server restart detected while the player is on /cards shows the "match ended" notice instead of "the server restarted". Found in the B1 code review. | todo |

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
| N4 | server | S | Process safety net: log `uncaughtException` and `unhandledRejection` (today any missed bug is fatal and silent). Validation (P0-1) stays the real fix. | done (#4) |
| C4 | client | S | React error boundary with a reload action. Today any render exception shows a blank white screen and nobody hears about it. | done (#10) |

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
| N8 | server | M | Split `server/app.ts` (about 700 lines after PR 2b) into rooms, handlers and timers once the demo is over; plan it with the architect. Found in the PR 2a review. | todo |
| C5 | client | S | Art files aren't content-hashed and are served with `maxAge: '1h'`, so a replaced portrait stays stale for up to an hour. Cache-bust art (for example a hash in the manifest). Pairs with C2's immutable /assets. | todo |
| C6 | client | S | Client hygiene: remove `ds.shown!` non-null assertions, replace the native `confirm()` forfeit dialog, clean up per-room `al:t:<code>` token keys that pile up in localStorage. | todo |
| C7 | client | M | Accessibility: keyboard play, focus states, ARIA labels, and houses told apart by more than colour. | todo |
| C8 | client | S | The `.game` root is keyed on the shake counter (Game.tsx:260), so every hit of 4 or more remounts the whole board: framer-motion state resets and the hand's entry animation replays. Shake a wrapper or use an animation instead of a key change. Found in the PR 1 review. | todo |
| C9 | client | S | Rules numbers still hard-coded outside PR 4's files: Gallery.tsx:7 and :19 ("MAX 1/2/3", "Legend ×1, Rare ×2, Common ×3") should read `DECK_RULES`, and Game.tsx "WAITING 60s" repeats the server's drop grace (PvP only). Found in the PR 4 review. | todo |
| C10 | client | S | First Light is hard to see: at 1366x650 the divider chip renders at about 8 px in dim grey, so the holder's total is 2 more than its rows add up to with no visible reason. Show the bonus next to the holder's total in Round 1, or make the chip legible. Found in the PR 4 ux pass. | todo |
| C11 | client | S | The first-visit How to play shows 17 keywords at about 10 px beside the 5 steps: a wall of text for a first impression. Consider showing only the steps there and pointing to the in-game "Rules & keywords". Found in the PR 4 ux pass. | todo |
| C12 | client | S | In a match a card can’t be read: the right-hand inspect panel, the only reading surface, renders rules text at 5.7 px and keyword help at 9 px at 1366x650 (7.1 and 11.3 px at 1440x900). Target 12 px or more at 1366x650. Promoted into the demo by the condition set in the PR 4 ux pass ("fix if a card’s text can’t be read on hover"), with measurements from the PR 3 ux check. Branch `fix/C12-readable-inspect`. | done (#12) |
| C13 | client | S | When the pass button reads PASS · WIN MATCH, the hint above the hand still says "Pass to take the round, or keep building". Say "match" when passing ends the match (Game.tsx `prompt`). Found in the PR 4 final ux pass. | todo |
| C14 | client | S | Drake-07’s taller text panel (4 lines since PR 3) hides the feet in its art. Move the art up about 50 px (`client/src/art.ts`, `ART.drake.ay` -120 to about -170). Needs Aiden’s eye. Found in the PR 3 ux check. | todo |
| C15 | client | S | The "Your turn…" prompt pill covers the top of a lifted hand card, including its power. Board tiles cut long names ("Quartermaste"), and a token’s "ECHO" label sits partly under its power badge. At inner 1366x650 the outer hand cards also extend about 16 px below the stage at rest (unchanged since before PR 4; moved here from C12). Found in the PR 3 ux check and the PR 6 ux check. | todo |
| C16 | client | S | Readability outside the match: the gallery zoom’s keyword help is 10.8 px at 1366x650, and the deck builder has no readable view of a card’s rules text (3.5-4.4 px; the builder is hidden in the demo). Some long names (High Marshal Odric, The Fallen Colossus, Mercenary Captain, The Lantern Keeper) are wider than their text panel. Found in the PR 3 ux check. | todo |
| C17 | client | S | Phone screen on tablets: on an iPad (834x1194, or iPadOS 1180x820) the side-by-side block floats with about 40% empty above and below. At 768 px wide or more, stack it, widen the image and scale the type up; in portrait, put the image first. Found in the PR 5 ux pass. | todo |
| C18 | client | S | Fullscreen is hard to find where it matters: the in-match "Fullscreen" link is about 8 px dim grey at 1280x600, and the Home icon has no label (70% opacity, tooltip only). Label it, or show a one-time hint when the stage scale is below 0.75. Found in the PR 5 ux pass. | todo |
| C19 | client | S | Revisiting your own old match link a second time says "YOU’VE BEEN INVITED" (the first visit correctly says it ended and clears the seat), and Join then says "expired". Remember ended codes and show the ended message. Related: on an end screen kept after a restart (PR 5 ux1), Rematch emits to a room that no longer exists and nothing happens; disable it or explain. Found in the PR 5 ux pass and code review. | todo |
| C20 | client | S | After "Try anyway" on a phone in portrait, the desktop stage is tiny. Show a "Rotate your phone" hint. Found in the PR 5 ux pass. | todo |
| C21 | client | S | The inspect panel keeps the unit object captured when the mouse entered it (Game.tsx:245), so a unit whose statuses change during an animation shows stale statuses until it is hovered again. Read the live unit by uid instead. Found in the PR 6 code review. | todo |
| C22 | client | S | Match inspect panel polish, from the PR 6 ux re-check: (m2) the POWER badge sits under the totals in the same label-over-number pattern, so at a glance the column reads as three scores; mirror the card face (power left of the name) or use the board tiles' disc. (m4) The POWER and KEYWORDS labels and the epithet are 7-9 px at 1366x650. (m5) A vanilla card says "No ability. Raw power." and then "No keywords. This card is just its power." (m6) Every "(now)" status is red, including helpful ones (Shield, Grow). Optionally dim a silenced unit's printed keyword lines. From the PR 6 delta code review: (m7) CardFace's `power` prop and the `.card-power .n.up/.down` CSS branch are now dead code; (m8) PowerBadge's class expression renders `class=""` at base power, simplify it. From the PR 6 final ux check: (m9) inspect text is 11.3 px at inner 1280x600 (see C24 for the other small text there). | todo |
| C23 | client | S | Recovery polish from the PR 5 code review: (1) during a long outage the "Connection lost. Reconnecting..." overlay blocks the in-match Home button, so browser Back is the only way out; offer "Back to home" after about 30 s. (2) A Play vs Bot click on a socket refused at load waits for the 4 s OFFLINE timeout before reconnecting; connect first and let the buffered create flush, without a double create through the `pendingStart` retry. (3) The RECONNECTING screen shown for a refusal at load on /r/CODE has no way home while the server keeps refusing; same "Back to home" fix. (4) `onPop` keeps a stale Home `error`, which can show under RECONNECTING after browser Forward. (5) Test strength: recovery-ux.spec.ts's Enter/Space check under the overlay can't fail on its own (focus is on `<body>`); focus PASS before the drop. server-ended.spec.ts:160 reuses `spawnPort(6)` with :94, which clashes if e2e ever runs in parallel. | todo |
| C24 | client | S | Small text at inner 1280x600, from the PR 5 ux re-check: the in-match "Rules & keywords · Fullscreen · Forfeit" links render at 8 px, PR 4's PLAYTEST label at 7.3 px and the Home links at 10.7 px. Also: the RESTARTED notice leaves "one." alone on its last line, and og.jpg could use a 40-60 px left margin (the wordmark sits 8 px from the edge, which an iMessage crop touches). | todo |
| C25 | client | S | The match inspect panel is hover-only: a player can't pin a card to read it while moving the mouse to the board, and touch-laptop users can't open it at all. Click (or tap) to pin, click again or Esc to release. From the PR 6 final ux check. | todo |
| C26 | client | S | The back row slides about 70 px over about 300 ms at match start and again about 500 ms after some state updates, so the unit under a parked cursor changes and the inspect panel switches cards on its own. Check whether that slide is intended; if not, remove it. Found by qa-engineer while fixing a PR 6 test flake (the tests now read the panel in one atomic snapshot). | todo |
| C27 | client | S | Fill the window: the stage width follows the window up to 21:9 instead of side bars. Reported by Aiden. | review ([#16](https://github.com/Anh1264/afterlight/pull/16)) |
| C28 | client | S | Units in a row are left-aligned (`.row-units` has no justify-content), so on wide windows a row is mostly empty space on the right. Centre or spread them; part of Aiden's board redesign. From the C27 ux check. | todo |
| C29 | client | S | 16:10 windows (1440x900) still get bars of about 45 px at the top and bottom, and the hand is cropped at the stage edge. Let the height follow the window too (C27 did the width). From the C27 ux check. | todo |
| E5 | engine | S | engine.ts:104 seeds with `Math.random` when no seed is passed, a gap against invariant 1 (determinism). Require a seed, or move the default to the server. Found in the demo design challenge. | todo |
| E6 | engine | S | Null-9 and Puppeteer text leaves out what seize does at the edges: the taken unit loses Poison, and moves to the other row when its own row is full (engine.ts:555-565). Afterimage does not say which unit it copies when two are tied for strongest (the engine takes the one that reached the board first, engine.ts:542), which decides the Echo’s row. Text only. Found by game-designer during PR 3. | todo |
| E7 | engine | S | Two words for one thing: Drake-07 says "Summon a 3-power Echo" while Glitch Rat, Static Runner, Shard Bot and Gridlock Golem say "Summon a 3/2-power token". Lattice and Wire Hound show the Echo tooltip for "tokens"; a separate "Token" keyword would be more accurate. game-designer to pick one wording; re-check Drake’s wrap (its text box is 300 px). Found in the PR 3 ux check. | todo |
| E8 | engine | S | Hacker's strip (engine.ts:383-386) clears Guard and Shield but emits a `silence` status event. So director.ts:179 shows the unit as fully silenced (Grow and Poison cleared, "Silenced (now)") until the batch snaps to the server view. Give strip its own status event. Separately, the Silence keyword help (cards.ts:404) doesn't say Silence also cancels Last Words (engine.ts:170), an invariant 5 nit. Found in the PR 6 code review. | todo |
| E9 | engine | S | Security (invariant 2): `validate()` checked `targets` only for a `units` spec, so a crafted client could send targets for a card with no legal target (Azhar destroying a 9-power unit). Found by qa-engineer while testing cards-v2 wave 1. | done ([#19](https://github.com/Anh1264/afterlight/pull/19)) |
| E10 | engine | S | From the E9 review: `targetRow`, `mode` and `row` on specials are also unchecked when the spec doesn't use them; safe today only because every such effect does nothing on an empty board. Have `validate` return a cleaned action holding only the fields the spec uses, and pass only that to `doPlay`; plus a fuzz-lite property that stray fields are rejected or change nothing. | todo |
| CARDS2-W1 | engine | M | cards-v2 wave 1: 41 new cards on today's effects (149 total), `cultist:M:K`. Spec docs/specs/cards-v2.md. | review |
| CARDS2-W2 | engine | L | cards-v2 wave 2: 27 cards needing 13 new effects (Kinship, Muster, Devour, Flourish, Enrage, Rekindle, Infiltrate, Endure, Last Light, plus damaged/purge/row-dependent/copy-enemy). After E1. Rename "Muster" first: it is the original Witcher 3 term. | todo |
| E11 | engine | S | From the wave-1 review: `cultist:M:K` copies the legacy cultist body (engine.ts:451-461 vs :525-535, :293 vs :315). Route bare `cultist` through the new branch with M=3, K=2 and delete the legacy case. | todo |
| E12 | balance | S | Afterimage drives the copy deck to 68% at 3 copies (51% at 1). Nerf before CV-4 opens the free builder. From cards-v2. | todo |
| G3 | bot | S | Bot target choice is biased: the depth-first 40-combination cap (bot.ts:29-39) means every Bastion or Ember Storm candidate on a 10-wide board includes the first unit. Enumerate by size or rank targets first. From the wave-1 review. | todo |
| C30 | client | S | Echo Lens (151 chars) and Gut Hag (139) are far longer than any card text before (104). Check their card faces and the inspect panel at 1366x650. From the wave-1 review. | todo |
| O5 | ops | M | Staging environment: a Railway environment that deploys from a `staging` branch. Today production is the only place the full stack runs. | todo |
| O6 | ops | S | Version releases: package.json still says 0.1.0 and there are no git tags. Tag each deploy (pairs with the build SHA in O3). | todo |
| O7 | ops | S | Bump `concurrently` (2 critical audit issues in `shell-quote`, dev-only). | todo |
