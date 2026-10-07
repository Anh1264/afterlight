# DEMO-MVP - Public desktop demo vs the bot

Size: L (epic, delivered as 5 PRs)    Owner: product-strategist    Status: approved (Gate 1, Aiden, Tue 2026-10-06)
Written Tue 2026-10-06 against commit e44a92e. Reworked the same day into 5 PRs after red-team's challenge (see "Challenge"). The link goes public on Tue 2026-10-13.

## Player problem
A stranger clicks Aiden's link on a computer and wants to try a new card game for ten minutes. Today several things can stop them:
- Another visitor's malformed message can kill the server, and their match with it.
- The pass button can promise a round win that turns out to be a tie.
- A 60-second clock can pass their whole round while they are still reading their first hand.
- The bot gives away Round 1 to a player who passes at once.
- A phone gets the board at about a quarter of its size.

**Goal:** by Tue Oct 13, a desktop visitor can open a public link, learn the rules, finish a full match against the bot and want another one. Nothing a visitor sends can crash the server. Phone visitors get a clear "open this on a computer" screen instead of a broken board. Everything else waits.

## Decisions
1. **Vs bot is the only advertised mode.**
   - "Invite a friend" shows only at `/?pvp=1`, so Aiden can still demo PvP in person.
   - Existing `/r/<CODE>` links keep working.
   - PvP is neither tested nor promised this week.
2. **Starter decks only, enforced by the server.**
   - The deck builder is hidden, and the server rejects custom decks in bot rooms.
   - Every card a visitor can meet is in the four balance-tuned starters.
3. **No turn clock against the bot.** Idle bot matches end after 15 minutes without a human action.
4. **Phones and tablets get a "made for desktop" screen,** not a mobile layout (C1 takes 1-2 weeks).
5. **A deploy freeze instead of persistence.** From Mon Oct 12 12:00 to Mon Oct 19, only a crash fix Aiden approves may merge. A deploy still drops live matches, so PR 5 turns that into an apology with a way home.
6. **Five PRs (PR 2 ships as 2a and 2b), not twelve.** Each PR costs a CI run, a review, a merge window and a production deploy. PRs 2-4 touch separate files and are built in parallel worktrees.
7. **Defaults Aiden accepted:**
   - PvP reachable at `/?pvp=1`.
   - "ART PENDING" removed.
   - The home label reads "PLAYTEST".
   - Public URL: Railway's `*.up.railway.app` domain. Aiden dropped the custom domain for this week on Oct 6; it can be added later.
   - Fewer than 50 players expected, so the room cap is a backstop against scripts, not a traffic limit.
   - No third-party error reporter this week.
8. **One Gate 1 covers the whole demo.**
   - Each PR runs the /ship steps from "tests first" onward: tests first, build, verify, review, PR.
   - The orchestrator owns every `docs/backlog.md` edit, so parallel PRs never conflict there.
   - The orchestrator creates each PR's worktree under `.claude/worktrees/`.

## Release criteria (Mon Oct 12 rehearsal, against production)
1. The e2e smoke test runs against the production URL (`E2E_BASE_URL`) at 1440x900, and a vs-bot match reaches the end screen.
2. The abuse scripts run against production:
   - malformed payloads
   - a room flood
   - two different client IPs

   Throughout, `/health` keeps answering, the room count stays under the cap, and a bot match started during the flood from another network (a phone hotspot) finishes normally.
3. Aiden's own phone, plus Playwright touch contexts at 844x390 and 390x844, show the desktop-only screen. Copy link works, and no card art downloads.
4. The public URL, pasted into a private Discord or Slack channel, previews with title, description and image.
5. The rehearsal matches appear in the Railway log as `match_start` / `match_end` lines and in the `/health` counters. `/health` shows the release commit's SHA.
6. Aiden, in a fresh browser profile in a normal laptop window (not fullscreen), reads the rules, finishes a match and rematches without help.

**No-go rule:** if criterion 1, 2 or 3 fails at 17:00 Monday, don't post. Fix it through /bug and rehearse again. Posting slips by a day before it ships a crash risk.

## Success metric
**First-match completion rate:** the share of first matches in a vs-bot room that end `normal` with at least 3 cards played by the human. Passing three times in a row doesn't count as finishing.
- **Target:** at least 50% over Tue Oct 13 - Mon Oct 19. This is a guess; there is no baseline, and this week sets one.
- **Caveat:** with fewer than 50 players the number is noisy. The feedback form and watching a few friends play will tell Aiden more.
- **Guardrail:** 0 server process exits.
- **Read daily from:**
  - the `/health` counters
  - the Railway log, exported daily (retention on the current plan is unverified; assume 7 days)
  - the feedback form

  The script that turns the log into funnel numbers is written after demo week.

## Viewports
| Viewport | What the visitor gets | Who checks it |
| --- | --- | --- |
| Desktop 1440x900 | The supported size; the game as today. | e2e smoke (every PR), ux-reviewer |
| Laptop windows: inner 1366x650 and 1280x600 | The scaled stage. Scale = min(innerW/1600, innerH/900) (Stage.tsx:10), about 0.67-0.72, so 13 px text renders near 9 px. A fullscreen button gives 0.8 on a 1280x720 screen. | ux-reviewer, Fri |
| Phones and tablets, touch-primary (844x390, 390x844, iPad) | The desktop-only screen (PR 5), with a "Try anyway" escape. | e2e (PR 5), Aiden's phone Mon |

## Build order: 5 PRs
Lanes:
- server-dev owns PR 2.
- engine-dev and game-designer own PR 3.
- client-dev owns PR 4, and a second client-dev worktree owns PR 5.

Every PR:
- writes its tests first (qa-engineer)
- keeps `npm run check` and the e2e smoke green
- is reviewed by code-reviewer

Client PRs also attach ux-reviewer screenshots.

### PR 1 - Test gates (T1, T4, T2)
M · tooling + ops · engine-dev (vitest, fuzzer split), qa-engineer (Playwright smoke), server-dev (CI) · branch `test/T1-test-gates` · merge Wed AM

Why: every merge this week deploys to a public URL. Every later PR needs a runner for its tests, a fuzz pass on every commit, and an automated proof that a stranger can still finish a match.
1. `npm run check` runs three things and exits non-zero if any single assertion is made to fail:
   - the typecheck
   - the existing 22 engine assertions under vitest, with the same meaning
   - a fuzz-lite pass: seeded random matches, checking after every action that there's no dead unit, no hand over 10 and no duplicate uid, and that every match finishes
2. `npm run sim -- N` prints exactly what it printed before. Importing the simulator library runs nothing; today it plays 700 matches at import.
3. `npm run e2e` builds the client and starts the server. A headless browser at 1440x900 then:
   - opens `/` and clicks Play vs Bot
   - picks a house and starts the match
   - acts until VICTORY, DEFEAT or DRAW shows
   - saves home, lobby, board and end screenshots to `e2e/out/smoke/`

   With `E2E_BASE_URL` set, it runs against that URL and starts no server (release criterion 1).
4. The smoke test passes 10 runs in a row locally, under 3 minutes each.
5. GitHub Actions runs check + build + `npm audit --omit=dev` (high and critical) on pushes to main and on PRs. It runs e2e on PRs only, so a flaky browser test can never block a hotfix deploy.
6. Aiden turns on Railway's Wait for CI. A push to main then shows WAITING until CI passes, and a red run is never deployed.

Moved out: the "restart the server mid-match" e2e helper is built in PR 5, its only user.

### PR 2 - Server hardening (P0-1, N4, P0-4, DM-2, DM-6, DM-8)
M (protocol additions, one area) · server-dev · ships as 2a (c1-c3, c6-c8; `feat/P0-1-server-hardening`, merge Thu by 12:00) and 2b (c4, c5, c9; `feat/P0-4-abuse-limits`, merge Thu by 18:00) · Wed-Thu
1. **Bad payloads.** Socket A is in a vs-bot match. Socket B then sends each of the following:
   - `game:action` with no ack
   - `game:action` with `null`, a string, `{type:'play', uid: 42}` and `{type:'launch'}`
   - `room:create` with no payload
   - `room:join` with a numeric code and no ack
   - `lobby:deck` with 10,000 ids
   - a message over Socket.IO's 1 MB limit

   Throughout, `/health` answers 200, and socket A can still play a card and receive the result. The oversized message disconnects only its sender.
2. **Ack errors.** A bad payload sent with an ack gets `{error: <string>}` within 1 s. No stack trace or internal error text reaches the client.
3. **Errors inside the server.** An error thrown while the server plays a bot turn, or runs any timer (turn timeout, disconnect grace, sweeper), has these effects:
   - The process keeps running and writes one `error` log line.
   - That match ends with the new "ended by error" signal (protocol addition 1).

   Process-level `uncaughtException` and `unhandledRejection` are logged and are never silent; after an `uncaughtException` the process exits with code 1 so Railway restarts it (N4). The architect provides the test seam.
4. **Per-visitor limit.** One client sends `room:create` 1,000 times. It holds at most one live room per socket. Creates past the per-client limit get "Too many new matches, try again in a minute."
   - 20 sockets from one IP (an office NAT) can each still start a bot match within a minute.
   - A second IP is unaffected.

   On Railway, the client IP comes from the proxy's header, and a client-supplied header can't dodge the limit. The design confirms the header and how it is trusted.
5. **Room cap and sweeping.**
   - At the global cap (about 10,000 rooms, about 70 MB), `room:create` answers "AFTERLIGHT is full right now. Try again in a few minutes." Existing matches keep running.
   - A lobby that never started and has no connected socket is swept sooner than today's 10 minutes; the design sets the number.
6. **Seats.**
   - When the same seat is open in two tabs, only the newest tab controls it, and actions from the older tab get an error.
   - A socket seated in room A that creates or joins room B is released from A.
7. **No clock vs bot (DM-2).**
   - In a vs-bot match, no turn deadline is sent and no timeout pass happens. After 5 minutes idle, the human still has the turn.
   - A bot match with no human action for 15 minutes ends with the "ended: idle" signal, and its room is freed.
   - PvP keeps the 60 s clock and timeout behaviour exactly as today.
8. **Starter decks only (DM-8).** `lobby:deck` in a bot room is rejected with an ack error. The match uses the house's starter deck, even if a client sent a custom deck.
9. **Log and health (DM-6).**
   - Each funnel event writes exactly one single-line JSON log:
     - `connect`, with the device class (protocol addition 2; `unknown` until PR 5 sends it)
     - `room_create`, with whether the room is vs bot
     - `match_start`, with the match number in the room, both houses and who went first
     - `match_end`, with the reason (normal, forfeit, leave, disconnect, error or idle), the winner, the round scores, the duration and the human's card plays
     - `rematch`
     - `error`

     No line contains a token, an IP or a player name.
   - `/health` returns:
     - the build SHA
     - rooms, sockets and memory
     - since-boot counts of connects, rooms created, matches started and matches ended normally

     It shows no codes, tokens or names.

Protocol additions. Both are optional fields, so old clients keep working:
1. The game message can say the server ended the match, and why (`error` or `idle`).
2. The client handshake can carry a device class (`phone`, `tablet` or `desktop`).

The architect names both.

### PR 3 - Bot Round 1 and card text (DM-1, DM-3)
S + S · engine (shared/bot.ts, shared/cards.ts text, README rows) · engine-dev + game-designer · branch `fix/DM-1-bot-round-one` · Wed-Thu
1. **Dry pass.** The human goes first and passes on their first turn of Round 1. Across 2,000 seeds, the bot wins Round 1 in at least 98%. If the human instead plays the card that raises their total most and then passes, the bot wins Round 1 in at least 85% of 1,500 seeds (today 32.8%). Today it concedes in 55.8% (red-team's harness); the original DM-1 fix made that 77.8%.
2. **First Light.** The bot judges who is ahead with the engine's totals, First Light included. Two fixed boards prove it:
   - Round 1, the human went first and passed. The bot's units total exactly 1 more than the human's, so it is really 1 behind. It plays a card; today it passes.
   - Round 1, the bot went first and the human passed. The bot's units total exactly 1 less, so it is really 1 ahead. It passes and keeps its cards.
3. In Rounds 2 and 3, the bot's decisions on a fixed set of seeded boards are identical before and after the change.
4. `npm run sim -- 200` still completes. The PR body lists the first-seat win %, draws and Round 3 % before and after. There is no separate balance report.
5. **Card text.** Drake-07's and Lattice's text describes exactly what the engine does:
   - Drake-07, played once in the Back row and once in the Front row
   - Lattice, played while its owner holds tokens of more than one kind

   The README rows match `cards.ts`. Text only, no behaviour change; game-designer writes the wording.

### PR 4 - Truth on screen and the demo surface (P0-3, DM-4)
M · client (Screens.tsx, Game.tsx, Card.tsx, styles.css) plus one pure helper in shared/ · client-dev · branch `feat/DM-4-demo-surface` · Wed-Thu
1. **Pass button.** What the pass button promises comes from a pure helper in shared/ that uses the engine's totals, and vitest tests it without a DOM:
   - Round 1, the opponent went first and passed, and my units total exactly 2 more. The button reads PASS · TIE ROUND; today it says WIN.
   - I went first, the opponent passed, and my units total 1 less. The button reads PASS · WIN ROUND; today it says TIE.
2. **Rules numbers.** The Round 1 divider chip, How to play and every rules number on screen come from `RULES` / `DECK_RULES`: First Light, hand size, rounds and row limits (today they are literals at Screens.tsx:60-66). Changing a constant changes the text.
3. At the end of Round 1, the scores in the round banner equal the totals shown just before it.
4. **Home.**
   - Home has one primary action, Play vs Bot.
   - Invite a friend shows only at `/?pvp=1`, and `/r/<CODE>` links still work.
   - The label reads PLAYTEST instead of v0.1.
5. **Lobby.** The vs-bot lobby has no Build deck or Use starter controls, and the deck chip reads "Starter deck · 25 cards". The client never sends a saved custom deck in a bot room.
6. **Art.** No card shows "ART PENDING". A card without art shows its house placeholder.
7. **How to play.**
   - In a fresh browser, the first Play vs Bot click opens How to play, and "Got it" continues to the lobby.
   - It never opens on its own again in that browser.
   - The e2e helper dismisses it, and the smoke test stays green.
8. **Feedback.** Home and the end screen show "Give feedback", which opens Aiden's form in a new tab. The URL lives in one constant, and the link stays hidden until it is set.

ux-reviewer screenshots: 1440x900 and inner 1366x650.

### PR 5 - Phones, link preview and recovery (DM-5, DM-7, C4)
M · client (index.html, App.tsx, main.tsx, net.ts, new components with their own stylesheet, one image under client/public/) · client-dev (second worktree) · branch `feat/DM-5-phone-and-recovery` · Wed PM-Fri AM
1. **Phone screen.**
   - Who sees it: a touch-primary phone or tablet, tested with Playwright touch contexts at 844x390 and 390x844 and an iPad profile.
   - What it shows, with all text at least 14 CSS px:
     - AFTERLIGHT and a one-line pitch
     - a board image
     - "Made for desktop: open this link on a computer"
     - Copy link, which confirms "Copied", or shows a selectable URL where the clipboard is blocked (in-app browsers)
     - a small "Try anyway" link
   - While it shows, no card art and no particle sheets are requested.
   - Desktop at 1440x900 and inner 1280x600 never sees it.
2. "Try anyway" shows the normal home, and the screen doesn't come back in that tab.
3. The client sends its device class in the socket handshake (protocol addition 2). An iPad counts as a tablet even though its user agent says Mac.
4. **Link preview.** Fetching `/` and `/r/ABCDE` with curl returns:
   - `og:title`
   - `og:description`
   - `og:image`: an absolute https URL on the public domain, 1200x630, answering 200
   - `twitter:card=summary_large_image`

   The image is a crop of a real screenshot of the game with real art. No generated art.
5. **Fullscreen.** A fullscreen button on home and in the match. In fullscreen on a 1280x720 screen, the stage scales to 0.8.
6. **Server restart.** A vs-bot match is in progress when the server restarts (a new e2e restart helper). Within 10 s of the server coming back, the visitor is on Home with "The server restarted and your match was lost. Sorry! Start a new one." They never see "YOU'VE BEEN INVITED" or "That match link has expired". If the server did not restart (the match ended while they were away), they see "That match has ended. Start a new one." instead.
7. **Server-ended match.** A match the server ends with the error or idle signal shows a matching message with a way home. It never shows a frozen board, VICTORY or DEFEAT.
8. **Server down.** With the server unreachable, Play vs Bot shows "Can't reach the server. Retrying..." within 5 s. It works again once the server is back. A click while the page is still connecting never shows it.
9. **Crash screen.** A render error anywhere shows "Something went wrong" with Back to home and Give feedback, never a blank page. The error goes to the console; there is no reporter this week.

ux-reviewer screenshots:
- 844x390 and 390x844 for the phone screen
- 1440x900 and inner 1280x600 for the rest

## OUT of scope
| Item | Why it's cut | When it comes back |
| --- | --- | --- |
| **C1** mobile layout (L) | One week, desktop only. The phone screen stands in, and the `connect` log counts who was turned away. | First after demo week, if phones are 30% or more of connects. |
| **O2** SIGTERM drain + persist/rehydrate (L) | The freeze removes deploys during the week, and PR 5 turns a lost match into an apology. | Right after demo week, before merges resume at full pace. |
| **E1** typed effect registry, **A1** self-describing events | Only Drake-07 and Lattice drifted among reachable cards, and PR 3 fixes their text by hand. Hacker is unreachable with starter decks enforced by the server. | Before the next card set or the deck builder's return. |
| **D1** Postgres match log | The log lines and `/health` counters answer this week's question. The event shapes are reused later. | The week after the demo. |
| **O3** pino, Sentry (server and client) | JSON log lines and the console are enough at this scale. Aiden chose no third-party reporter for the demo. | With D1. |
| Funnel script | Log lines can't be recovered later, but a script can be written later. | After demo week, run over the exported logs. |
| **T3** per-card tests for all 108 cards | Only the 56 starter cards are reachable; fuzz-lite covers crashes on every commit. | With E1. |
| **C2** asset diet | Desktop broadband; the phone screen skips the preload. | If Friday's ux pass measures a cold load over 3 s to a clickable Play vs Bot, the one-line "start the preload on Play vs Bot" change goes into the buffer. Otherwise with C1. |
| **N1** quick match, **N3** turn clock rework | PvP is hidden, and there is no clock against the bot. | Before PvP is promoted. |
| **C3** split Game.tsx | No visible change. | Before C1. |
| **G1** balance method, **G2** bot policy | PR 3 fixes the one bot defect a visitor will feel (Round 1). | After demo week, with human data. |
| **B1** Back on `/cards` opened directly | The posted link is `/`. | /bug after the demo. |
| Deck builder (exists) | Hidden; testing it costs a day and opens 52 untuned cards. | With T3 + A1. |
| PvP via share link (exists) | Reachable at `/?pvp=1` only, untested this week. | With N1/N3/O2. |
| Guided tutorial | How to play on first click is the 80% version. | If completion is under 50% and feedback says "confused". |
| Smarter bot, difficulty levels | Only the Round 1 fix. | If humans win outside 35-65% or find an exploit. |
| Share button, analytics vendor, accounts, leaderboards | The server log gives the funnel without a cookie banner. | After the metric says the game holds people. |
| E2, E3, E4, N5, N6, N7, C5, C6, C7, T5, O4-O7 | Real, but none of them is reachable by a visitor this week. P0-1 and N4 keep the process alive. | Backlog order after demo week. |

## Week plan
| Day | Work | Aiden |
| --- | --- | --- |
| **Tue Oct 6** | Gate 1 (done). PR 1 built tonight. Architect designs PRs 2-5, and red-team gets one pass at the design. | Railway: Serverless off (formerly App Sleeping), healthcheck `/health`, restart On Failure. Add the custom domain in Railway and set its DNS record (DNS and certificate can take hours). |
| **Wed Oct 7** | PR 1 merges in the morning. PRs 2a, 3 and 4 are built in parallel worktrees; PR 5 starts in the afternoon on its parts that need neither PR 2 nor PR 4. | Merge PR 1 and the planning docs. Check Actions is enabled; turn on Wait for CI. |
| **Thu Oct 8** | PRs 3, 4 and 2a merge by 12:00, 2b by 18:00. PR 5 is built. | Merge PRs 3, 4, 2a and 2b; run the spoof check after 2b deploys. Send the feedback form URL. |
| **Fri Oct 9** | PR 5 merges by noon. ux-reviewer plays main at inner 1366x650, 1280x600, 1440x900 and both phone sizes, including the cold-load time. Feature complete at end of day. | Merge PR 5. Play 3 full matches on prod in a fresh browser profile. |
| **Sat-Sun Oct 10-11** | Buffer: /bug only for Blocker/Major issues from Friday. No new scope. | Merge if available; otherwise buffer fixes merge Mon 09:00-12:00. |
| **Mon Oct 12** | Merges stop at 12:00. Rehearsal 13:00-17:00 on prod (release criteria 1-6). | Rehearsal; go/no-go at 17:00. |
| **Tue Oct 13** | Freeze; branches only. | **Post the link.** Check `/health` at +1 h, +4 h and end of day. |
| **Oct 13-19** | Freeze. | Export the log daily. Read the feedback form. Approve or refuse any crash fix. |

Don't paste the public link anywhere before PR 5 is live. Discord and X keep the first preview they fetch.

Parallel worktrees (file ownership):
- **PR 2:**
  - `server/**`
  - `shared/protocol.ts` (the two optional fields and runtime schemas)
  - new server tests and `e2e/reconnect.spec.ts`
- **PR 3:**
  - `shared/bot.ts`
  - `shared/cards.ts` (text fields only)
  - README.md (two rows)
  - new engine tests
- **PR 4:**
  - `client/src/components/Screens.tsx`, `Game.tsx` and `Card.tsx`
  - `client/src/styles.css`
  - one new pure helper in `shared/` with its test
  - `e2e/helpers.ts` (the How to play dismissal)
- **PR 5:**
  - `client/index.html`, `client/src/App.tsx`, `main.tsx` and `net.ts`
  - new components with their own stylesheet
  - the preview image under `client/public/` (outside `/art`)
  - its own new e2e specs, the restart helper and `playwright.config.ts` (one env line)
- **Shared rules:**
  - Only PR 1 changes dependencies; any later dependency needs the orchestrator's approval.
  - Each PR adds its own test files; nobody edits another PR's tests.

## Only Aiden can do these
| When | What | It unblocks |
| --- | --- | --- |
| Tue Oct 6 | Railway: Serverless off (formerly App Sleeping) (in-memory matches die when it sleeps), healthcheck path `/health`, restart policy On Failure, and note its max-retries limit on our plan (after PR 2 the server exits on an unexpected crash so Railway restarts it). Check the plan's log retention. | Stability, the metric |
| Tue Oct 6 | Check the service has a public Railway domain (Settings, Networking) and send it. No custom domain this week. | PR 5's link preview (`og:image` needs the final absolute URL) |
| Wed Oct 7 | Merge PR 1 and the planning-docs PR. Check GitHub Actions is enabled. Switch on Railway's Wait for CI and confirm one push shows WAITING. | Every later PR |
| Wed-Fri | Review and merge PRs (Gate 2). | Every item |
| Thu Oct 8 | Create the feedback form (Tally or Google Forms, 3-5 questions) and send the URL. | PR 4's feedback link |
| Fri Oct 9 | Merge PR 5 by noon. Evening: play 3 full matches on prod in a fresh browser profile. | Buffer list |
| Mon Oct 12 | Last merges by 12:00. Rehearsal: own phone, Discord/Slack preview, a fresh-profile match in a laptop window. Go/no-go at 17:00. | Posting |
| Tue Oct 13 - Mon Oct 19 | Post the link. Export the log daily. Approve or refuse any crash fix, deployed when `/health` shows the fewest rooms. | Metric, guardrails |

## Open questions
1. Can Aiden merge on Sat-Sun Oct 10-11? Default if not: buffer fixes merge Mon 09:00-12:00.
2. Resolved Oct 6: no custom domain this week. The demo uses the Railway URL, and the link preview reads it from `RAILWAY_PUBLIC_DOMAIN` at build time.
3. The feedback form URL, by Thu Oct 8.
4. If the production spoof check (ADR 0002) fails on Thu, one script could make the demo refuse new visitors (it cannot crash it). Posting anyway is Aiden's call at the Mon go/no-go.

## Challenge
Red-team attacked the first draft on Tue Oct 6. Its verdict: "The biggest risk is the schedule, not the code." Every objection below was accepted, and the 5-PR shape above is the result.

| # | Objection | Resolution |
| --- | --- | --- |
| 1 | **Blocker: the merge funnel.** About 12 PRs, through 6 merge windows, would put must-ship items after Friday's ux pass. Four were a serial chain on server/index.ts, and every PR would conflict on docs/backlog.md. | Accepted. 5 PRs: all server work in PR 2, and PRs 2-4 in parallel worktrees. The orchestrator owns every backlog edit. Friday's ux pass runs on a feature-complete main. |
| 2 | **P0-4 can lock out every visitor.** Behind Railway's proxy, `handshake.address` is the proxy, so a per-IP limit becomes one global limit. A 500-1,000 room cap is tiny (about 7 KB per room). Background tabs hold bot rooms forever once DM-2 removes the clock. | Accepted. The limit is keyed on the proxy's client-IP header and tested with two IPs. The cap is memory-sized (about 10,000 rooms, about 70 MB). Idle bot matches end after 15 min. Never-started lobbies are swept sooner. |
| 3 | **DM-1 makes the bot more exploitable.** A human who goes first and passes at once takes Round 1 off the bot 55.8% of the time today and 77.8% with DM-1 (2,000 seeds). The cause is that a 6-power play scores only +2 against the 4-per-card hand term (bot.ts:16, :96-97). Bot-vs-bot sims can't see it. | Accepted. PR 3 is gated on the dry-pass test: the bot takes Round 1 in at least 90% of seeds. The First Light fix ships with it. The sim report is cut. |
| 4 | **The protocol does change.** "Match ended by an error" needs a new signal, because the end screen only renders when `v.over`. Device class from the user agent counts iPads as desktops. | Accepted. Both are declared as optional protocol fields. The client half of the error message moved to PR 5. |
| 5 | **The laptop numbers were wrong.** A 1280x720 window has about 640 px of inner height, so the scale is 0.71, not 0.8. Playwright's viewport is the inner size, so tests at 1280x720 pass a size real users fail. | Accepted. ux-reviewer tests at inner 1366x650 and 1280x600. PR 5 adds a fullscreen button. |
| 6 | **Starter-only was enforced only in the client.** The server accepts any legal custom deck, and the lobby re-sends saved decks. | Accepted. The server rejects custom decks in bot rooms (PR 2, DM-8), and the client stops sending them (PR 4). |
| 7 | **N4 was missing.** The drop-timer forfeit and the sweeper stay unguarded. | Accepted. Every timer is wrapped, and process-level handlers log `uncaughtException` / `unhandledRejection` (PR 2). |
| 8 | **Minor: cross-item test breakage.** The first-click modal breaks the smoke helper. A per-IP limit can throttle e2e. The pass label is an untestable closure. The rules copy repeats literals. 100,000 ids exceed the 1 MB buffer. | Accepted. PR 4 updates the smoke helper. e2e runs one worker. The pass promise moves into a pure shared helper. Rules numbers come from constants. The payload test uses 10,000 ids plus a separate over-1 MB case. |
| - | **Cuts** red-team proposed: client Sentry, the funnel script, the DM-1 sim report, 844x390 screenshots except for the phone screen, and the board-screenshot approval. | All accepted. The link-preview image comes from a real screenshot, and Aiden sees it in PR 5. |
| - | **Unchecked assumptions:** Railway's client-IP header, log retention and export size, the SIGTERM grace, and the commit SHA at runtime. Pasting the link early poisons the preview cache. "Copied" may fail in in-app browsers. | The architect verifies the Railway facts in the design. The other two are now in PR 5's criteria and the week plan. |

<!-- architect appends "## Design" below; red-team's objections to the design and the architect's responses go under "## Design challenge" -->

## Design
Architect, Tue 2026-10-06. Designed against PR 1 as built (worktree `t1-test-gates`, commit 707ec52). server/index.ts line numbers refer to that commit; every other file is unchanged since e44a92e. Revised the same evening after red-team's design challenge; the rulings are in "Design challenge" at the end.
- ADRs: `docs/decisions/0001-demo-protocol-additions.md` and `0002-client-ip-from-railway-x-real-ip.md`.
- No new dependency. `socket.io-client` is already a devDependency; it drives the server tests and the abuse script.

### Spec issues (orchestrator decides; spec text untouched)
1. **PR 4 c2, "rounds".** There is no constant for rounds; the engine hard-codes `>= 2` and `>= 3` (engine.ts:651).
   - The design adds `RULES.ROUNDS = 3` and `RULES.WINS_NEEDED = 2` (cards.ts:381-387) and uses them at engine.ts:651.
   - That is a second shared/ edit in PR 4, with no behaviour change; engine-dev reviews it.
   - If refused, "OF 3" and "two of three" stay literal.
2. **Release c2 needs abuse scripts, and no PR owns them.** Proposal: PR 2 adds `scripts/abuse.ts` (about 80 lines; modes `malformed`, `flood`, `spoof`), and `"scripts"` joins tsconfig `include`.
3. **PR 2 c4: "per-client" is ambiguous.** The design defines two limits: 10 creates/min per socket and 60 per IP.
4. **PR 2 c7: "5 / 15 minutes".** These are tested with injected millisecond limits; a unit test pins the production defaults.
5. **PR 5 c4: "https on the public domain".** Only production can show this. Locally the test checks an absolute URL, a 200 response and 1200x630.
6. **PR 5 c5: headless Chromium can't resize the screen.** The test asserts the stage scale at a 1280x720 viewport, and that the button calls a stubbed `requestFullscreen`.
7. **Decision 2 vs PR 4 c5.** The deck builder is hidden in bot rooms only. PvP lobbies, reachable only by `?pvp=1` or an invite, keep it.
8. **server/CLAUDE.md says "zod".** The design uses hand-written guards; the shapes are tiny. Aiden may update that line.

**Orchestrator rulings (Tue Oct 6):**
- Issues 1-7: accepted as written. PR 4 adds `RULES.ROUNDS` / `RULES.WINS_NEEDED`. PR 2 owns `scripts/abuse.ts`.
- Issue 8: PR 2 updates server/CLAUDE.md's validation line in the same PR, so the docs match the code.

**Orchestrator rulings after the PR 4 review and ux pass (Tue Oct 6):**
- **PR 4 c1, extended: the pass button names a match result.** When passing now ends the match, it reads PASS · WIN MATCH, PASS · LOSE MATCH or PASS · DRAW MATCH instead of the round label. The ux pass found that at 0-1 a Round 2 tie reads PASS · TIE ROUND and then ends the match as DEFEAT, because a tied round gives both players a win (engine.ts:646).
  - `shared/engine.ts` exports a pure `matchWinner(wins: readonly [number, number], round: number): PIdx | 'draw' | null` (null: the match goes on), and `endRound` uses it, so the rule lives in one place.
  - `shared/pass.ts`: `RoundBoard` players gain `wins: number`, and `passMatch(b, me): 'win' | 'lose' | 'draw' | null` combines `passPromise` with `matchWinner`. Null while the opponent is still playing, or when the match goes on.
  - Game.tsx: the match label wins over the round label. Only a win is styled good.
- **PR 4 c7, extended: closing How to play in any way marks it seen,** whether it was opened from the Home link or by the first Play vs Bot click, via "Got it" or the backdrop. Only the first-visit "Got it" continues to the lobby. Home keeps one modal state, `'link' | 'first' | null`.
- **`client/src/prefs.ts` (new, PR 4)** holds `SEEN_RULES_KEY` and its storage helpers. e2e/helpers.ts re-exports the key, so the client and the tests can't drift apart.
- **PR 3's text fix widened to every Echo-starter card whose text says something the engine doesn't do.** game-designer found three more: Replicator and Afterimage (Echo starter) say "copy", but the engine makes a plain Echo token that copies only power, without Grow, Guard or Shield (engine.ts:397, :540-544); Wire Hound (not a starter) has Lattice's bug, "Echo tokens" where the engine boosts every token (engine.ts:420). Each gets a text test like Drake-07's. The Echo keyword tooltip also matches `token`, so "Your tokens gain 2" still explains what a token is. Null-9 and Puppeteer only leave out edge cases (a seized unit loses Poison; it moves rows when its row is full), so they go to the backlog (E6).
- **Deferred to the backlog:** the First Light chip's legibility at 1366 (C10), the first-visit modal's keyword column (C11), hand cards clipped at 1366x650 (C12, for Friday's ux pass), and the rules literals outside PR 4's files (C9).

**Orchestrator rulings after the PR 2a review and PR 5 tests (Tue Oct 6):**
- **PR 2a, blocking fix.** `drop()` must ignore a room that `endByServer` or `deleteRoom` already removed (`if (rooms.get(r.code) !== r) return;`). Otherwise, when a PvP opponent leaves after a server-ended match, the other player gets a disconnect toast and then a forfeit VICTORY, which ADR 0001 forbids. It also stops `close()` from arming timers on dead rooms. Test: after `ended: error`, a disconnect sends nothing more within the grace period.
- **PR 2a, also fixed now.** A malformed `/r/CODE` answers "That match link has expired or never existed." rather than "Bad request.", so a bad link reads like an old one. Tests are added for a seat that rejoins twice (the drop timer must be cleared) and for `parseDevice` accept and reject.
- **Moved to 2b** (it edits the same file):
  - before `release()`, check that the join can succeed, so a full or started link doesn’t forfeit the current match;
  - wire `lobbyIdleMs`;
  - the bot-lobby timer that `drop(true)` arms on a removed seat, and `socket.leave`;
  - `failRoom` for a failure after the match-ending move (`if (r.game)`, and `phase !== lobby` in the wrapper);
  - a test for the `installProcessHandlers` call.

  Splitting `server/app.ts` (524 lines) waits until after the demo (N8).
- **Merge order is binding: PR 4 before 2a.** Today’s client sends the saved deck in a bot lobby, 2a refuses it, and the client would then wipe the player’s saved deck ("Saved deck reset").
- **PR 5 adds `e2e/server-ended.spec.ts`.** It holds c7 idle, c7 error and the refusal check, because they boot `e2e/test-server.ts`, which needs 2a’s `createGameServer`.
  - PR 5 can’t be committed until it merges main after 2a, because `test-server.ts` doesn’t typecheck before then. The refusal check passes once 2b is in.
  - Its c6 "restarted" case also needs 2a’s `uptimeS`.
- **Give feedback on the crash and server-ended screens** follows PR 4’s rule: it shows only when `FEEDBACK_URL` is set.

### Approach
- **PR 2** ships as 2a (crash-proofing, seats, DM-2, DM-8) and then 2b (abuse limits, funnel log, `/health` counters).
  - `server/index.ts` becomes a thin entry point over a `createGameServer(opts)` factory in `server/app.ts`.
  - The per-connection closures (`room`, `seatIdx`, `attach`, `drop`; index.ts:152-271) move as they are, so today's reconnect path keeps working. Each handler adds a one-line ownership check.
  - Every inbound event goes through one wrapper: normalise the ack, validate, catch. Every timer goes through one guard.
  - Sockets per IP are counted from live sockets. Fixed windows only rate-limit creates.
  - Durations and hooks are injected, so vitest boots real servers on port 0.
- **PR 3:** `decide()` uses `totals()` and gains one deterministic Round-1 rule, gated on how much the opponent committed.
- **PR 4:** the pass promise moves to `shared/pass.ts`, and every rules literal becomes a constant.
- **PR 5:**
  - a device gate in `main.tsx` before `App` mounts
  - og tags via Vite env replacement
  - recovery in `App.tsx` and `net.ts`, with a pure classifier that asks `/health` whether the server restarted
- **Rejected for PR 2: session state in `socket.data` with a `seated()` lookup** (the first draft). It rewrites the attach and drop path that works today, and no criterion needs it.
- **Rejected for PR 2: a per-IP socket counter** (+1 in the middleware, -1 on disconnect). A socket that closes during the middleware fires neither `connection` nor `disconnect` (socket.io 4.8.4 namespace.js:222-226), so the count only drifts up.
- **Rejected for the bot:** an ungated "take any round cheaply" rule. It also scores 100% on the dry pass, but it moves bot-vs-bot first-seat wins from 46.4% to 36.1%.
- **Rejected for testing time:** fake timers. They also fake Socket.IO's heartbeats.

### PR 2 - server (2a, then 2b)
**2a starts with a pure move, with the smoke still green.**
- `server/app.ts` (new) takes index.ts:19-281.
- `rooms` (:44) moves inside the factory, so test servers share nothing.
- The connection handler (:152-272) keeps its closures. `attach` (:156-164) and `drop` (:250-271) keep their bodies; "Seats" below lists the only changes.
- `server/index.ts` keeps about 20 lines: `installProcessHandlers(process, consoleSink)`, `createGameServer({...from env})`, `await srv.listen(PORT)`, then a `server_start` line.
- Moved lines may keep their `!`; any line you rewrite drops it.
```ts
// server/app.ts
export type TimerKind = 'bot' | 'turn' | 'drop' | 'idle' | 'sweep';
export interface ServerHooks {
  onTimer?(kind: TimerKind, code: string | null): void; // first line of every guarded timer
  onHandler?(event: string): void;                      // first line of every wrapped handler
  onView?(seat: PIdx): void;                            // before every viewFor() the server sends
}
export interface ServerOptions {
  distDir?: string | null;                   // null: API only (tests)
  limits?: Partial<ServerLimits>;            // merged over DEFAULT_LIMITS
  trustProxy?: TrustProxy;                   // default 'none' (2b)
  log?: LogSink;                             // default consoleSink
  botDelayMs?: (events: GEvent[]) => number; // default animTime(events) + 500 + Math.random() * 700 (today's :121)
  hooks?: ServerHooks;
  buildSha?: string;                         // default 'dev' (2b)
}
export interface GameServer { listen(port: number): Promise<number>; close(): Promise<void>; health(): HealthJson }
export function createGameServer(opts?: ServerOptions): GameServer;
```
- `close()` clears the sweeper and all room timers, then closes io and http.
- **No injected randomness.** No test asserts a match outcome. In 20,000 seeded deals, every opening hand held a unit that needs no target, so the testkit always finds a play. The game seed, the bot house (:221) and the bot jitter (:121) stay as today.
- **Seams:**
  - `hooks.onTimer` runs first in every guarded timer, `hooks.onHandler` first in every handler, and `hooks.onView` before every `viewFor()` whose result is sent. Tests throw from them.
  - All durations are `limits` in ms. Tests pass e.g. `{ turnMs: 50, dropGraceMs: 300, botIdleMs: 150, sweepEveryMs: 20, lobbyIdleMs: 0 }` with `botDelayMs: () => 0`.
  - `log` captures the lines.

**`server/limits.ts`.** 2a ships the duration fields; 2b adds the abuse fields, `clientIp`, `ipKey` and `FixedWindow`.
```ts
export interface ServerLimits { turnMs: number; dropGraceMs: number; botIdleMs: number; lobbyIdleMs: number; roomIdleMs: number;
  sweepEveryMs: number; maxRooms: number; maxSockets: number; maxSocketsPerIp: number; createsPerSocketPerMin: number; createsPerIpPerMin: number }
export const DEFAULT_LIMITS: ServerLimits = { turnMs: TURN_SECONDS * 1000, dropGraceMs: 60_000, botIdleMs: 15 * 60_000,
  lobbyIdleMs: 2 * 60_000, roomIdleMs: 30 * 60_000, sweepEveryMs: 30_000, maxRooms: 10_000, maxSockets: 2_000,
  maxSocketsPerIp: 40, createsPerSocketPerMin: 10, createsPerIpPerMin: 60 };
export type TrustProxy = 'x-real-ip' | 'none';
/** X-Real-IP if trust is 'x-real-ip' and net.isIP() accepts it (a duplicated header arrives joined as "a, b" and fails), else remoteAddress. */
export function clientIp(headers: IncomingHttpHeaders, remoteAddress: string, trust: TrustProxy): string;
/** Limit key: IPv4 as is, IPv4-mapped IPv6 as its IPv4, any other IPv6 as its /64 prefix. */
export function ipKey(ip: string): string;
export class FixedWindow { constructor(windowMs: number, max: number); can(key: string, now: number): boolean; add(key: string, now: number): void; prune(now: number): void }
```

**Validation** lives in `shared/protocol.ts` (2a only). The server types inbound events as `{ [K in keyof ClientToServer]: (...args: unknown[]) => void }`, so nothing is typed until parsed; the client keeps its typed `ClientToServer`.
- `export type Parsed<T> = { ok: true; v: T } | { ok: false; field: string }`. `field` names the first bad field (`'payload'`, `'uid'`, `'targets'`, ...).
- `ROOM_CODE_ALPHABET` and `ROOM_CODE_LENGTH = 5` move here from index.ts:45-48.

| # | Event (index.ts) | Parser -> accepted shape, bounds | Seat check | Notes |
| --- | --- | --- | --- | --- |
| 1 | `room:create` (:166) | `parseCreate` -> `{name: string <=64, vsBot: boolean}` | - | `release()`, then (2b) limits and cap, then create; `clean()` still trims to 18 |
| 2 | `room:join` (:179) | `parseJoin` -> `{code, name <=64, token?}`; code: string <=16, uppercased, then 5 chars of the alphabet; token `/^[0-9a-f]{32}$/` | - | validate, then `release()` unless the socket is re-joining its own seat, then attach; newest tab takes the seat |
| 3 | `lobby:house` (:192) | `parseHouse` -> one of `ALL_HOUSES` | owns seat, lobby | no ack |
| 4 | `lobby:deck` (:200) | `parseDeck` -> `null` or `string[]` <=64 entries, each <=40 chars | owns seat, lobby | bot room and not null: "Matches against the bot use the starter deck."; then `validateDeck` |
| 5 | `lobby:ready` (:213) | `parseReady` -> `boolean` | owns seat, lobby | bot house as today (:221) |
| 6 | `game:action` (:227) | `parseAction` -> `{type:'pass'}` or `{type:'play', uid 1-16 chars, row?: 'F'/'B', targets?: <=8 strings 1-16 chars, mode?: int 0-7, targetRow?: 'F'/'B'}`; builds a fresh object, drops other keys | owns seat | engine `validate()` stays the rules check |
| 7 | `game:forfeit` (:233) | args ignored | owns seat, playing | reason `forfeit` |
| 8 | `game:rematch` (:235) | args ignored | owns seat, over | logs `rematch` (2b) |
| 9 | `room:leave` (:247) | args ignored | - | `release()`: acts only if `owned()` |
| 10 | `disconnect` (:248) | reason ignored | - | `drop(false)` only, which checks ownership itself (:254); never deletes a room |
| - | handshake `auth` | `parseDevice(auth): DeviceClass \| 'unknown'` | - | log only (2b) |

- **Wrapper:** `on(event, fn: (payload: unknown, reply: Reply) => void)`, defined inside the connection closure.
  - It pops the last argument if it is a function (the ack), so a missing ack, or an ack in the payload slot, is harmless.
  - `reply` is a no-op without an ack and fires at most once.
  - Inside `try`, it calls `hooks.onHandler`, then `fn(args[0], reply)`.
  - A bad payload gets `reply({ error: BAD_REQUEST })` (`'Bad request.'`) and adds 1 to `rejected`. From 2b it also writes a `bad_request` warn line with the event and the field, never the value, at most once per event and field per minute.
  - A throw writes one `error` line and gets `reply({ error: GENERIC_ERROR })` (`'Something went wrong. Please try again.'`). If the socket owns a seat in a `playing` room, it also calls `endByServer(room, 'error')`.
  - Engine rule errors ("Not your turn.") still pass through. No stack trace and no `e.message` ever reaches a client.
- **Seat ownership:** `owned()`, inside the closure, is `room !== null && rooms.get(room.code) === room && room.seats[seatIdx]?.socketId === socket.id`.
  - A handler marked "owns seat" that fails it replies "This match is open in another tab." when the room still exists and another socket holds the seat, else "Not in a match."
  - A deleted room fails the check, so `endByServer` never has to reach other sockets' closures.
- **Seats (c6).** These are the only changes to `attach` and `drop`:
  - `attach` keeps clearing `s.dropTimer` (:160). If the seat's previous `socketId` is a different socket, that socket gets the toast "This match is now open in another tab." The same socket re-attaching gets nothing: the client sends `room:join` twice on every load (App.tsx:44-45).
  - The grace timer keeps its `if (!s.socketId)` re-check (:268), runs under `guard('drop', ...)` and waits `dropGraceMs`.
  - `release()`: if `owned()`, call `drop(true)`, then delete the old room if it is vs bot. Either way, clear `room` and `seatIdx`. Only `room:leave`, `room:create` and `room:join` call it.
  - `disconnect` calls `drop(false)` only. A lobby keeps its room (:257-262), and a match gets the grace period.
  - 2b replaces the 10-minute lobby timer (:260) with the sweep's `emptySince` rule.
- **Timers:** `guard(kind, room, fn)` wraps the bot timer (:116), the turn timer (:124), both drop timers (:260, :268), the new idle timer and each room in the sweep. Its body: `try { hooks.onTimer?.(kind, room?.code ?? null); fn(); } catch (e) { logError('timer:' + kind, e, room); if (room) failRoom(room); }`.
  - `failRoom(room)` calls `endByServer(room, 'error')` while `playing`, else `deleteRoom`.
  - If that throws too, the last resort clears the room's timers, toasts its seated sockets the ended text below, calls `rooms.delete` and logs once more.
- **N4:** `installProcessHandlers(proc: Pick<NodeJS.Process, 'on' | 'exit'>, log: LogSink)`.
  - `uncaughtException`: one `error` line (`where: 'process:uncaughtException'`), then `proc.exit(1)`. Node does not support resuming after one. Railway restarts a process only when it exits: its healthcheck runs at deploy time only (docs.railway.com/deployments/healthchecks, checked Oct 6). PR 5's restart message covers the players.
  - `unhandledRejection`: one `error` line, no exit.
  - Every request and timer path is guarded, including the `io.use` middleware body (socket.io does not catch a sync throw there), so neither handler fires in normal play.
- **Socket.IO:** `new Server(http, { cors: { origin: true }, maxHttpBufferSize: 1_000_000 })`. That is explicit and equal to the default. It fits the 10,000-id case (about 150 KB), and anything over 1 MB closes only the sender.
- **`endByServer(r, reason: 'error' | 'idle')`, playing rooms only:**
  1. Clear the room's timers and increment `r.seq`.
  2. Toast each seated socket, for old clients: "This match was ended by the server. Go Home to start a new one."
  3. Send each seated socket `game { seq, view, events: [], deadline: null, ended: reason }`. `view` is `viewFor(g, i)` inside its own try, falling back to `seat.lastView`. A seat with neither gets only the toast.
  4. Call `finishMatch(r, reason)` and `rooms.delete`.
  - `seat.lastView` holds the last view sent to that seat (set in `sendGame` and `attach`). An engine throw that leaves the state half-changed still ends the match on screen, with the last good board. It is a reference to an object already built, about 4 KB per human seat.

**Abuse limits (2b)**
| Limit | Number | Where | Response |
| --- | --- | --- | --- |
| Live rooms per socket | 1 | `room:create` / `room:join` call `release()` first (2a) | - |
| Creates per socket | 10/min (`FixedWindow` keyed by `cid`) | `room:create` | "Too many new matches, try again in a minute." |
| Creates per IP | 60/min (keyed by `ipKey`; only accepted creates count) | `room:create` | same |
| Open sockets per IP | 40, counted live: sockets in `io.of('/').sockets` with the same `data.ipKey` | `io.use` middleware | `connect_error` "Too many connections from your network. Try again later." |
| Open sockets, all IPs | 2,000 (`maxSockets`, against `io.engine.clientsCount`); stays on with `LIMIT_PER_IP=off` | `io.use` middleware | `connect_error` "AFTERLIGHT is full right now. Try again in a few minutes." |
| Global rooms | 10,000 (`maxRooms`) | `room:create` | "AFTERLIGHT is full right now. Try again in a few minutes." |
| Lobby or over with no human socket | 2 min after `emptySince` (set when the last human leaves) | sweep, every 30 s | deleted |
| Any room untouched | 30 min (unchanged, :279) | sweep | deleted |
| Bot match, no human action | 15 min (`idleTimer`, re-armed on every accepted human action; 2a) | guarded timer | `endByServer(r, 'idle')` |

- **Live counting:** the middleware sets `socket.data = { ipKey, cid, device }`, then counts. That is one scan of at most 2,000 sockets per connect, and there is no counter to leak.
- **Why a socket cap:** rooms are bounded by `maxRooms` (a GameState is 4-5 KB, so 10,000 rooms is about 50 MB). Sockets were bounded only per IP, and nothing bounded them with `LIMIT_PER_IP=off`.
- **c4 arithmetic:** a 1,000-create flood from one socket gets 10 accepted, each releasing the previous room. That leaves 50 creates for the 20 NAT sockets in that minute.
- **Client IP (ADR 0002):** Railway documents `X-Real-IP` (verified: docs.railway.com, Public Networking "Specs & Limits").
  - `trustProxy` is `'x-real-ip'` when `RAILWAY_ENVIRONMENT_NAME` is set, else `'none'`. `TRUST_PROXY=none|x-real-ip` overrides that.
  - `LIMIT_PER_IP=off` sets both per-IP limits to `Infinity`. The per-socket window, `maxSockets` and `maxRooms` stay.
  - Limits key on `ipKey(ip)`, so an IPv6 host can't dodge them by rotating through its /64.
  - **Unverified:** whether Railway overwrites a client-sent `X-Real-IP`. After 2b deploys, `scripts/abuse.ts spoof` opens 41 sockets, each with a different `X-Real-IP`, and passes if one is refused (ADR 0002).
  - No custom domain this week. If one is added later, its DNS must be "DNS only" (no CDN proxy).
- **How tests avoid the limits:**
  - Server tests boot one server per test with `trustProxy: 'x-real-ip'`, and set each socket's IP with `extraHeaders: { 'x-real-ip': '10.0.0.N' }`.
  - e2e uses 1 worker with local trust `'none'`, and makes under 10 rooms/min.
  - The prod smoke run 10 times makes about 10 rooms in 30 min.
  - An abuse run blocks Aiden's IP until its sockets close, and its creates for a minute, so release c2's "other browser" match uses a phone hotspot.

**DM-2 / DM-8 (2a).**
- `scheduleTurn` (:122-128) arms the turn timer only if `!r.vsBot`. Vs bot, `deadline` stays `null` and nothing auto-passes. PvP keeps `turnMs` (= `TURN_SECONDS * 1000`).
- `startGame` (:101) passes `decks: r.vsBot ? [null, null] : [a.deck, b.deck]`.

**Funnel log (`server/log.ts`).** 2a ships `LogSink`, `consoleSink`, `logError` and the `error` line; 2b adds the rest.
- Each event is one `console.log(JSON.stringify(line))` on stdout. Railway parses `message` and `level` from a single-line JSON (verified: docs "Structured logs").
- Every line carries `{ level, message, ts }`.
- `rid` and `cid` are random 8-hex ids, never the room code, a token, an IP or a name.

| message | level | Extra fields | Emitted in |
| --- | --- | --- | --- |
| `connect` | info | `cid`, `device: DeviceClass \| 'unknown'` | `io.on('connection')` |
| `room_create` | info | `rid`, `cid`, `vsBot` | `room:create`, after `rooms.set` |
| `match_start` | info | `rid`, `n` (match number in the room, from 1), `vsBot`, `houses: [House, House]`, `first: PIdx`, `botSeat: PIdx \| null` | `startGame` |
| `match_end` | info | `rid`, `n`, `vsBot`, `reason: 'normal'\|'forfeit'\|'leave'\|'disconnect'\|'error'\|'idle'`, `winner: PIdx \| 'draw' \| null`, `rounds: [number, number][]`, `ms`, `plays: [number, number]` (accepted card plays per seat), `botSeat` | only `finishMatch(r, reason)`, called from `scheduleTurn` when `g.over` (normal), `endByForfeit(r, loser, reason)` and `endByServer`; `r.matchOpen` makes it fire once |
| `rematch` | info | `rid`, `n` (the new match number) | `game:rematch` when both have accepted (:239) |
| `bad_request` | warn | `event`, `field` (no value) | the wrapper, at most once per event and field per minute (`FixedWindow(60_000, 1)`) |
| `error` | error | `where: 'handler:<event>' \| 'timer:<kind>' \| 'process:<event>'`, `rid \| null`, `err` (message, <=200 chars), `stack` (first 6 lines) | `logError` (2a) |
| `server_start` | info | `sha`, `port` | index.ts (2a); one line per boot, so crash restarts are countable |

**`/health` (:56).** 2a adds `uptimeS` (PR 5's classifier reads it); 2b adds the rest.
```json
{ "ok": true, "sha": "<RAILWAY_GIT_COMMIT_SHA | BUILD_SHA | 'dev'>", "uptimeS": 512, "rooms": 3, "sockets": 4,
  "memMB": { "rss": 81, "heapUsed": 34 },
  "counts": { "connects": 40, "roomsCreated": 12, "matchesStarted": 9, "matchesEndedNormal": 6, "errors": 0, "rejected": 2, "limited": 0 } }
```
`RAILWAY_GIT_COMMIT_SHA` is verified in Railway's variable reference. It is set only for GitHub-triggered deploys; a `railway up` deploy would show `dev`, and the rehearsal catches that.

**Protocol additions (ADR 0001, 2a)**
```ts
export type ServerEndReason = 'error' | 'idle';
export interface GameMsg { seq: number; view: PlayerView; events: GEvent[]; deadline: number | null; ended?: ServerEndReason }
export type DeviceClass = 'phone' | 'tablet' | 'desktop';
export interface HandshakeAuth { device?: DeviceClass }   // client: io({ auth: { device } })
```
Old clients:
- `ended` is ignored. The board freezes, the toast explains, and actions get "Not in a match."
- They send no `device`, so `connect` logs `unknown`.

### PR 3 - bot and card text
**Rule (shared/bot.ts).** bot.ts:87 becomes `const t = totals(g); const diff = t[me] - t[other(me)];`. No `+2` appears anywhere. Insert after :95:
```ts
export const R1_TAKE = { MAX_OPP_CARDS_ON_BOARD: 1, MAX_CARDS: 2, CARD_SLACK: 1 } as const;
/** Best single legal play (engine validate(), no try/catch) after which `me` is strictly ahead on totals();
 *  smallest winning margin first, non-Legends before Legends, then candidatePlays order. */
export function bestTakingPlay(g: GameState, me: PIdx): Play | null;
/** Opponent has passed: cards `me` needs to get strictly ahead. 1 if bestTakingPlay exists, else greedy bestPlay steps up to max. */
export function takeRoundCost(g: GameState, me: PIdx, max: number): { cards: number; first: Play } | null;
// in decide(), o.passed branch, after `if (r === 3 || mustWin) return play;`:
if (r === 1 && o.units.filter(u => !u.token).length <= R1_TAKE.MAX_OPP_CARDS_ON_BOARD) {
  const c = takeRoundCost(g, me, R1_TAKE.MAX_CARDS);
  if (c && p.hand.length - c.cards >= o.hand.length - R1_TAKE.CARD_SLACK) return c.first;
}   // otherwise fall through to bot.ts:96-98 unchanged
```
- **Rounds 2-3 unchanged by construction:** `totals()` equals `score()` outside Round 1, and the new branch runs only when `r === 1`. Measured on 410 seeded R2/R3 boards: 0 decisions differ (red-team reproduced it).
- No random draws. `evaluate()` is untouched, because First Light cancels out of its deltas.

**Measured** with the architect's harness, which reproduces `npm run sim -- 200` exactly for today's bot. Round-1 wins are strict; ties count as failures. The "strongest card" column is red-team's harness (1,500 seeds), re-run by the architect.
| Bot | Dry pass, bot wins R1 (2,000 seeds) | "Weakest card, then pass" | "Strongest card, then pass" | sim first / second / draws / round 3 |
| --- | --- | --- | --- | --- |
| today | 38.5% (human 55.8%, tie 5.7%) | 71.7% | 32.8% | 46.4% / 49.7% / 4.0% / 97% |
| DM-1 alone (`totals` only) | 22.1% | - | - | 45.7% / 50.1% / 4.2% / 93% |
| **proposed** | **100.0%** (about 0.94 cards spent) | **98.2%** | **87.9%** | **45.8% / 50.0% / 4.2% / 93%** |
| proposed, `MAX_OPP_CARDS_ON_BOARD: 2` | - | - | - | 38.4% / 56.6% / 5.0% / 93% |
| rejected: no opponent-commit gate | 100.0% | 98.2% | - | 36.1% / 59.4% / 4.5% / 97% |

- Round 3 drops from 97% to 93% because of the First Light fix itself (see the DM-1 row). The PR body pastes the real `npm run sim -- 200` output, before and after.
- A gate of 2 opponent cards costs the first seat 7.4 points, close to the rejected rule, so it is not a fallback lever (risk 4).
- Human match wins against the proposed bot: 38.7% after a dry pass (today 50.4%), 48.8% after "strongest card, then pass" (today 52.1%).

**Tests (`shared/bot.test.ts`, written by qa before the change)**
- **c1:** for each seed `s` in 0..1999:
  - set up houses `[ALL_HOUSES[s%4], ALL_HOUSES[(s+1+((s>>2)%3))%4]]` with `createGame({ seed: s, first: 0 })`
  - seat 0 passes
  - the bot plays `decide(g, 1, mulberry(s))` until Round 1 ends

  Assert `results[0].winner === 1` in at least 98% of seeds (measured 100.0%). It takes about 1.6 s, so all 2,000 seeds stay in `npm run check`.
- **c1b:** for each seed `s` in 0..1499, the same houses, `first: 0`:
  - Seat 0 plays its strongest play: the `candidatePlays(g, 0)` entry that raises `totals(g)[0]` most after `doPlay` + `endTurn` on a clone (ties: the later entry).
  - The bot answers with `decide(g, 1, mulberry(s * 3 + 1))`, seat 0 passes, and the bot plays until Round 1 ends.

  Assert the bot wins Round 1 in at least 85% (today 32.8%, proposed 87.9%).
- **c2:** start from `createGame({ houses: ['COVEN','EMBER'], seed: 1, first })`. Set `units` and `hand`, set `players[0].passed = true` and `current = 1`, then call `decide(g, 1, () => 0.99)`.
  - (a) `first: 0`. Human units `[bog-brute 4]`, bot units `[flame-warden 5]`. Human hand `[thornling, mire-toad, bog-brute]`, bot hand `[pyre-hound, cinder-imp, ash-cultist]`. Expect `type: 'play'`; today it passes.
  - (b) `first: 1`. Human units `[bog-brute 4]`, bot units `[cinder-imp 3]`. Bot hand `[pyre-hound, cinder-imp, ash-cultist, hellfire]`, human hand 3 cards. Expect `pass`; today it plays.
- **c3:** seeds 80000-80119.
  - Walk each match randomly: `candidatePlays`, a 15% pass chance, driven by `mulberry(seed)`.
  - At every R2/R3 decision point (at most 400), record `decide(g, p, mulberry(i + 1))`.
  - Assert with `toMatchSnapshot()`. qa commits `shared/__snapshots__/bot.test.ts.snap`, generated from today's bot. CI never writes snapshots.
- **c5 (`shared/cards-text.test.ts`):**
  - Engine behaviour tests for both cards (green before and after).
  - Drake's text must match `/other row/`, and Lattice's must not match `/Echo tokens/`.
  - Each README ability cell must equal `text.map(a => [a.kw, a.t].filter(Boolean).join(' ')).join(' ') || '—'`. Without the `'—'`, the 5 vanilla rows (Bog Brute, Lancer, Pyre Hound, Patchwork, Sellsword) fail before any change.

**What the text must describe.** game-designer writes the words; the engine doesn't change.
- **Drake-07** (cards.ts:140: `echo: 3`, `eff: 'echo3front'`). In order:
  1. The Echo keyword summons a 3-power "Echo" token in the row other than Drake's (engine.ts:596).
  2. The Deploy summons another 3-power "Echo" in the Front row (engine.ts:539).

  Either summon is skipped if its row already holds `RULES.ROW_MAX` units (engine.ts:236).
  - Placed in Back: two Echo 3 in Front.
  - Placed in Front: one Echo 3 in Back and one in Front.

  Suggested form, the same as Glitch Rat's: `Echo 3.` + `Deploy: Summon a 3-power Echo in your Front row.`
- **Lattice** (cards.ts:179). The Deploy gives +2 to every token on its owner's side when it lands, whatever the token's name (engine.ts:480: `me.units` with `u.token`). That covers:
  - Echo, Spark, Spore, Sapling, Recruit and Phoenix tokens
  - Replicator and Afterimage copies
  - enemy tokens taken by Null-9 (seize keeps `token: true`)

  Lattice itself and later tokens are not affected. The current text, "Your Echo tokens gain 2", is wrong once a seized Spark or Sapling is on the board, and starter decks can reach that.

### PR 4 - truth on screen
**`shared/pass.ts`** (new). Its inputs are all in `PlayerView`, so it needs no hidden information.
```ts
export type PassOutcome = 'win' | 'tie' | 'lose';
export interface RoundBoard { round: number; first: PIdx; players: [{ units: Unit[]; passed: boolean }, { units: Unit[]; passed: boolean }] }
/** What passing now does to the round when the opponent has already passed; null while they are still playing. Uses totals(). */
export function passPromise(b: RoundBoard, me: PIdx): PassOutcome | null;
```
Game.tsx uses it in three places:
- `passLabel` (:252-256), via `PASS_LABEL: Record<PassOutcome, string>`
- the `good`/`bad` class (:369)
- the prompt (:200)

**Literals to replace**
| Where | Today | Becomes |
| --- | --- | --- |
| Game.tsx:193-194 | `sum(...) + (round 1 && first ? 1 : 0)` | `const t = totals(v)`; `myTotal = t[me]`, `opTotal = t[op]` (fixes c3) |
| Game.tsx:284 / :285 | `OF 3` / `FIRST LIGHT +1` and its title | `RULES.ROUNDS` / `+${RULES.FIRST_LIGHT}` |
| Game.tsx:35 / :45 | diamonds `[0, 1]` / `left > 60` | `RULES.WINS_NEEDED` slots / `TURN_SECONDS` |
| Screens.tsx:19 / :58 | "Three rounds." / "two of three" | `RULES.ROUNDS`, `RULES.WINS_NEEDED` (digits or a word map) |
| Screens.tsx:60 / :64 / :66 | `8`, `2`, `10` / `+1` / `6 units` | `OPEN_HAND`, `ROUND_DRAW`, `HAND_MAX` / `FIRST_LIGHT` / `ROW_MAX` |
| cards.ts:381-387, engine.ts:651 | engine `>= 2`, `>= 3` | add `ROUNDS: 3` and `WINS_NEEDED: 2` to `RULES`; engine.ts:651 reads them (spec issue 1) |

`Num` (Game.tsx:27) also renders `data-value={value}`, so e2e reads the target number, not the spring's in-between value.

**Demo surface**
- **Home:**
  - Screens.tsx computes `const pvp = new URLSearchParams(location.search).get('pvp') === '1'`, and Invite (:26) renders only when `pvp`. App.tsx is unchanged.
  - :17 reads `A TWO-PLAYER CARD DUEL · PLAYTEST`.
- **Lobby:**
  - :179-180 are hidden when `room.vsBot`.
  - `choose()` (:107) sends a saved deck only `if (saved && !room.vsBot)`.
  - The chip reads `Starter deck · {myList.length} cards`.
  - No deck-builder code is deleted.
- **Card.tsx:53:** remove the ART PENDING div. The sigil placeholder (:52) stays.
- **How to play:**
  - localStorage key `al:seen-rules` = `'1'`, read and written through a helper that `console.warn`s storage errors (no silent catch).
  - With the key unset, Play vs Bot opens `Rules`.
  - "Got it" sets the key and calls `onBot()`. Closing via the backdrop sets the key and stays on Home.
- **e2e/helpers.ts:**
  - Export `SEEN_RULES_KEY = 'al:seen-rules'`.
  - In `startBotMatch`, after the click: `await expect(lobbyHeading.or(gotIt)).toBeVisible()`. If `gotIt` is visible, click it; then expect the lobby.
- **Feedback:**
  - `client/src/links.ts` (new) holds `export const FEEDBACK_URL: string = '';`. Aiden's URL is a one-line commit on Thu.
  - When it is non-empty, Home links and EndScreen actions (:428) render `<a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Give feedback</a>`.

### PR 5 - phones, preview, recovery
**`client/src/device.ts`** (new).
- `classifyDevice(s: DeviceSignals): DeviceClass` is pure and tested with vitest.
- `deviceClass()` memoises it over `readDeviceSignals()` = `{ ua, maxTouchPoints, coarsePrimary: matchMedia('(pointer: coarse)').matches, screenShort: min(screen.width, screen.height) }`.
- Rules, first match wins:
  1. `/iPad/` -> tablet
  2. `/Macintosh/` with `maxTouchPoints > 1` -> phone if `screenShort < 600`, else tablet (iPadOS, and an iPhone's "Request Desktop Website", send a Mac UA; Macs report 0 touch points)
  3. `/iPhone|iPod/` -> phone
  4. `/Android/` -> phone with `/Mobile/`, else tablet
  5. `coarsePrimary` -> tablet if `screenShort >= 600`, else phone
  6. everything else -> desktop (touch laptops have a fine primary pointer)

**Where it runs.**
- `main.tsx` renders `<ErrorBoundary><Root/></ErrorBoundary>`. `Root` holds `gate = deviceClass() !== 'desktop' && sessionStorage['al:try-anyway'] !== '1'` and renders `<PhoneGate onTryAnyway>` or `<App/>`.
- No `/art/*` image loads while the gate shows:
  - `preloadArt()` runs only in App's effect (App.tsx:24).
  - The `.stage::before` grain loads only when a `.stage` exists.
  - The only `/art/` request is the `manifest.json` fetch at import (art.ts:49).
- `net.ts` imports `deviceClass` for `auth`, so phones still connect and appear in `connect` lines.

**`PhoneGate.tsx` + `shell.css`** (new):
- A plain responsive page, not the stage, with every font-size at least 14px.
- It shows AFTERLIGHT, a pitch line, `<img src="/og.jpg">` and the "Made for desktop" line.
- Copy link calls `navigator.clipboard?.writeText(location.href)`. On success the button says "Copied"; on a rejection or no clipboard it shows `<input readOnly value={location.href}>`, selected on focus.
- "Try anyway" sets the sessionStorage key and flips `gate`.

**Link preview.**
- `client/index.html` gets static tags. The copy carries no rule numbers.
  - `og:type`, `og:title`, `og:description`
  - `og:url` = `%VITE_PUBLIC_ORIGIN%/` and `og:image` = `%VITE_PUBLIC_ORIGIN%/og.jpg`, with `og:image:width` 1200 and `og:image:height` 630
  - `twitter:card` = summary_large_image, plus `twitter:image`
- Vite 8 replaces `%VITE_*%` in HTML (checked: `htmlEnvHook` in node_modules/vite).
- `vite.config.ts` adds `define: { 'import.meta.env.VITE_PUBLIC_ORIGIN': JSON.stringify(process.env.VITE_PUBLIC_ORIGIN ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : 'http://localhost:3001')) }`.
- `playwright.config.ts` adds `VITE_PUBLIC_ORIGIN: baseURL` to `webServer.env`, so the e2e build points `og:image` at the server under test (port 3101), not 3001.
- No custom domain this week (Aiden, Oct 6), so the build takes `RAILWAY_PUBLIC_DOMAIN` (Railway's `*.up.railway.app` domain) and Aiden sets nothing. Unverified: that Railway exposes it during the build. After PR 5's first production deploy, check the og URLs in the served HTML; if they say localhost, Aiden sets `VITE_PUBLIC_ORIGIN=https://<railway domain>` and redeploys. `VITE_PUBLIC_ORIGIN` is also how a custom domain is added later.
- `/r/ABCDE` gets the same HTML through the SPA fallback (server/index.ts:60).
- `client/public/og.jpg` is a 1200x630 JPEG. Capture it with `page.screenshot({ type: 'jpeg', quality: 85, clip: { x, y, width: 1200, height: 630 } })` of a mid-match board at a 1600x900 viewport (scale 1). Aiden approves it in the PR.

**Fullscreen.**
- `FullscreenButton.tsx` renders in App outside the stage (`<><Stage>{screen}</Stage><FullscreenButton/></>`), fixed top-right.
- It is hidden when `!document.fullscreenEnabled`, and while in fullscreen (Esc exits).
- It calls `document.documentElement.requestFullscreen()`; a rejection is `console.warn`ed.
- The stage already rescales on resize: at 1280x720, min(0.8, 0.8) = 0.8.

**Recovery (App.tsx, net.ts, `client/src/recovery.ts`)**
- **Lost match.** `lastSeen = useRef<{ code: string; at: number } | null>` is updated on every `room` and `game` message and cleared by `home()`. When the rejoin (App.tsx:42) fails while a token exists (`al:t:<CODE>`, net.ts:11-12), App:
  1. calls `store.clearToken(code)` (new), `replaceState('/')`, `setCode('')`, `setRoom(null)` and `director.reset()`
  2. fetches `/health` (2 s timeout) and calls `lostMatch(lastSeen?.code === code ? lastSeen.at : null, Date.now(), uptimeS)`
  3. shows `RESTARTED` or `ENDED`
  ```ts
  // client/src/recovery.ts
  /** 'restarted' only if the server booted after this tab last heard about the match. */
  export function lostMatch(lastSeenAt: number | null, now: number, uptimeS: number | null): 'restarted' | 'ended';
  // restarted iff lastSeenAt !== null && uptimeS !== null && uptimeS * 1000 < now - lastSeenAt
  ```
  - `RESTARTED`: "The server restarted and your match was lost. Sorry! Start a new one."
  - `ENDED`: "That match has ended. Start a new one." This covers a laptop lid closed past the grace period and sweep, an old tab, and a fresh page load.

  The Join screen (App.tsx:72, Screens.tsx:83) is then reached only for codes without a token, which are real invites. An `OfflineError` during rejoin is ignored, and the next `connect` retries.
- **Ended signal.** App.tsx:34 becomes `m => m.ended ? onEnded(m.ended) : director.push(m)`. `onEnded` clears the token and calls `replaceState('/')`, so a later reconnect can't rejoin and replace the message. With `ended` set, the screen is `<ServerEnded reason onHome={home}/>`:
  - error: "Something went wrong on our side and this match had to end. Sorry!"
  - idle: "This match ended because nobody played for a while."
  - Both offer Back to home and Give feedback. Game.tsx is untouched.
- **net.ts:**
  - Line 4 becomes `io({ autoConnect: true, transports: ['websocket', 'polling'], reconnectionDelayMax: 3000, auth: { device: deviceClass() } })`.
  - `createRoom` (:22-28) always uses `socket.timeout(4000).emit(...)`, and a timeout becomes `OfflineError`. There is no `!socket.connected` fast path: Socket.IO buffers an emit while it connects, and a timed-out emit is removed from that buffer (socket.io-client socket.js:286-293). A click in the first moments after load reaches the lobby.
- **App:**
  - On `OfflineError`, App shows `"Can't reach the server. Retrying..."` and sets `pendingStart.current = vsBot` (a ref).
  - One `connect` listener, registered at mount, reads the ref: it clears the message and retries the create once.
  - On `connect_error` with `!socket.active` (the server refused the socket: per-IP or global cap; socket.io-client then never reconnects, socket.js:502-506), App shows `err.message` on Home and calls `socket.connect()` after 10 s. Transport errors keep Socket.IO's own reconnect.
- **ErrorBoundary.tsx.** A class component around `Root` in main.tsx, outside the stage and App state.
  - `componentDidCatch` sends the error to `console.error`.
  - The fallback shows "Something went wrong", "Back to home" (`location.assign('/')`) and Give feedback.
  - Seam: `Root` renders a throwing `<CrashTest/>` when `location.hash === '#__crash'`.
- **Restart helper.**
  - `e2e/server-proc.ts` exports `spawnServer(port: number, entry: 'server/index.ts' | 'e2e/test-server.ts', env?: Record<string, string>): Promise<{ url: string; stop(sig?: NodeJS.Signals): Promise<void> }>`.
  - It spawns `process.execPath` with `['--import', 'tsx', entry]` (tsx 4.23, Node 22), not `npx tsx`, so a signal reaches the server itself. It polls `/health` for up to 20 s and fails if the child has exited (EADDRINUSE). `stop()` sends the signal and resolves on the child's `exit`.
  - c6 and c8 spawn `server/index.ts` with `PORT`. That works on today's main and after PR 2, so they are built before PR 2 merges.
  - `e2e/test-server.ts` (needs 2a) boots `createGameServer({ distDir: 'dist', limits: { botIdleMs: Number(process.env.BOT_IDLE_MS || 900000), maxSocketsPerIp: Number(process.env.MAX_SOCKETS_PER_IP || 40) }, hooks: process.env.FAIL_BOT_TURN ? { onTimer: k => { if (k === 'bot') throw new Error('e2e'); } } : undefined })` on `PORT`. c7 and the refusal check use it; `maxSocketsPerIp` takes effect once 2b is in.
  - It uses ports 3102 and up, one per test, with the `dist/` that Playwright's webServer already built. The specs skip when `E2E_BASE_URL` is set.
  - Pages use `browser.newContext({ baseURL: srv.url })` and pre-seed `SEEN_RULES_KEY`.

### File ownership and merge order
| PR | Files (n = new) |
| --- | --- |
| 2a | `server/app.ts` n, `server/index.ts`, `server/limits.ts` n, `server/log.ts` n, `shared/protocol.ts`, `server/CLAUDE.md` (validation line). Tests: `server/testkit.ts` n, `server/app.test.ts` n, `server/log.test.ts` n, `shared/protocol.test.ts` n, `e2e/reconnect.spec.ts` n |
| 2b | `server/app.ts`, `server/limits.ts`, `server/log.ts`, `scripts/abuse.ts` n, `tsconfig.json` (+`scripts`). Tests: `server/abuse.test.ts` n, `server/limits.test.ts` n, `server/funnel.test.ts` n |
| 3 | `shared/bot.ts`, `shared/cards.ts` (text of Drake-07, Lattice, Afterimage, Wire Hound and Replicator, plus the Echo keyword `match` at :399; nothing in `RULES`), `README.md` (those five rows). Tests: `shared/bot.test.ts` n, `shared/__snapshots__/bot.test.ts.snap` n, `shared/cards-text.test.ts` n |
| 4 | `shared/pass.ts` n, `shared/cards.ts` (`RULES` :381-387 only), `shared/engine.ts` (`endRound` :643-656 and the new `matchWinner`), `client/src/components/Screens.tsx`, `Game.tsx`, `Card.tsx`, `client/src/styles.css`, `client/src/links.ts` n, `client/src/prefs.ts` n, `e2e/helpers.ts`. Tests: `shared/pass.test.ts` n, `e2e/demo-surface.spec.ts` n |
| 5 | `client/index.html`, `vite.config.ts`, `playwright.config.ts` (one env line), `client/src/main.tsx`, `App.tsx`, `net.ts`, `client/src/device.ts` n, `client/src/recovery.ts` n, `components/PhoneGate.tsx` n, `ServerEnded.tsx` n, `ErrorBoundary.tsx` n, `FullscreenButton.tsx` n, `components/shell.css` n, `client/public/og.jpg` n. Tests: `client/src/device.test.ts` n, `client/src/recovery.test.ts` n, `e2e/test-server.ts` n, `e2e/server-proc.ts` n, `e2e/phone.spec.ts` n, `e2e/preview.spec.ts` n, `e2e/recovery.spec.ts` n, `e2e/server-ended.spec.ts` n |

Overlaps:
- **server/app.ts, limits.ts, log.ts:** 2a creates them; 2b branches from 2a in the same lane and extends them. Nobody else touches `server/`.
- **Game.tsx:** PR 4 only. The ended-match UI lives in App.tsx and ServerEnded.tsx (PR 5).
- **shared/protocol.ts:** 2a only; PR 5 only imports it.
- **e2e/helpers.ts:** PR 4 only. 2a's reconnect spec and PR 5 import from it; neither edits it.
- **playwright.config.ts:** PR 5 only.
- **shared/cards.ts:** PRs 3 and 4 touch disjoint hunks, so git merges them.

Merge order:
- 2a, 3 and 4 are independent. Suggested order: 3, 4, then 2a (Thu by 12:00), then 2b (Thu by 18:00; Fri 10:00 at the latest).
- If the orchestrator keeps PR 2 as one PR, 2a and 2b are its two commit groups, in that order, and the reconnect tests land in the tests-first commit.
- Whichever PR merges later updates by running `git merge origin/main` into its branch, then `npm run check` and `npm run e2e`, then a normal push. Not rebase: force-push is blocked.
- PR 5 starts with everything that needs neither PR 2 nor PR 4: the gate, preview, fullscreen, crash screen, the recovery client code, and the restart helper with c6 and c8 on `server/index.ts`. It merges main after 2a (`GameMsg.ended`, `createGameServer`, `uptimeS`) and PR 4 (`SEEN_RULES_KEY`, `FEEDBACK_URL`). Only its refusal check waits for 2b.
- Each of PRs 2a-4 keeps the smoke green on its own:
  - 2a accepts today's client payloads (`undefined` keys dropped, `targets: []`).
  - PR 3 has no UI change.
  - PR 4 updates the helper.

### Test plan (qa-engineer writes these before the code)
**PR 2 seams (`server/testkit.ts`, 2a):**
- `bootServer(opts) -> { url, srv, logs: LogLine[] }`
- `client(url, { ip?, device? })`, built as `io(url, { forceNew: true, transports: ['websocket'], extraHeaders, auth })`
- `ask(s, ev, payload, ms = 1000)`, using `s.timeout(ms).emitWithAck`
- `next(s, ev, pred?)`
- `startBotMatch(url, ip?)`
- `firstSimplePlay(view)`: a unit card where `targetSpecFor(view, me, eff).kind === 'none'`, else `{ type: 'pass' }`

| Criterion | File | Kind | PR |
| --- | --- | --- | --- |
| c1 each bad payload; a 1.1 MB string disconnects only B; A then plays and gets `game` | `server/app.test.ts` | socket | 2a |
| c2 `{error}` acks within 1 s, text `BAD_REQUEST` or `GENERIC_ERROR` (via a throwing `hooks.onHandler`), no stack; each `parse*` accept/reject table, with the `field` | `server/app.test.ts`, `shared/protocol.test.ts` | socket + unit | 2a |
| c2 every `candidatePlays()` output from 50 seeded bot-vs-bot games, through `JSON.parse(JSON.stringify(p))`, parses and deep-equals the input | `shared/protocol.test.ts` | unit (property) | 2a |
| c3 `onTimer` throws for bot, turn (PvP), drop (PvP), idle and sweep: 1 `error` line each, `ended: 'error'` to the seated sockets, `/health` 200, a new match starts | `server/app.test.ts` | socket | 2a |
| c3 `onView` armed mid-match throws in `sendGame` after `applyAction`, and again in `endByServer`: the play gets `GENERIC_ERROR`, then `ended: 'error'` arrives with the last view, and rooms -1 | `server/app.test.ts` | socket | 2a |
| c3 process handlers with a fake emitter: `uncaughtException` -> 1 line, then `exit(1)`; `unhandledRejection` -> 1 line, no exit | `server/log.test.ts` | unit | 2a |
| c6 the older tab's action gets "open in another tab", and its `room:leave` leaves the newer tab's match running; creating B releases A (room count falls) | `server/app.test.ts` | socket | 2a |
| c6 reconnect, `dropGraceMs: 300`. (i) Bot match: A plays and disconnects; B joins with A's token 50 ms later, gets `game` with the same hand size, and its actions are still accepted 600 ms later. (ii) Bot lobby: A disconnects; B joins with A's token 100 ms later, gets the lobby, and `/health.rooms` is unchanged. (iii) One socket sends `room:join` twice: no `toast`, still seated | `server/app.test.ts` | socket | 2a |
| c6 mid-match `page.reload()`; the board comes back; a fresh `playMatchToEnd` (the init script resets `__plays`) reaches the end screen with no forfeit | `e2e/reconnect.spec.ts` | e2e | 2a |
| c7 vs bot with `turnMs: 50`: every `deadline` is `null`, and it is still the human's turn after 300 ms; `botIdleMs: 150` -> `ended: 'idle'` and rooms -1; PvP with `turnMs: 50` auto-passes; `DEFAULT_LIMITS` durations pinned | `server/app.test.ts` | socket + unit | 2a |
| c8 in a bot room, `lobby:deck` with a legal custom deck gets an ack error; after the match starts, every card in `view.players[you].hand` is in `STARTERS[house]` | `server/app.test.ts` | socket | 2a |
| c4 1,000 creates from one socket: 10 accepted, at most 1 live room, then the limit text; 20 sockets on the same IP each start a match; IP 2 unaffected; 60 connect/disconnect cycles from one IP, then a 61st socket connects; with 40 open, the 41st gets "Too many connections"; `maxSockets: 3` refuses a 4th socket from another IP | `server/abuse.test.ts` (`trustProxy: 'x-real-ip'`) | socket | 2b |
| c4 `clientIp` (including a duplicated header), `ipKey` (v4, v4-mapped, two v6 in one /64, one outside), `FixedWindow`, abuse defaults pinned | `server/limits.test.ts` | unit | 2b |
| c5 `maxRooms: 3`: the 4th create gets the full text while matches continue; a socketless lobby is gone after `lobbyIdleMs` | `server/abuse.test.ts` | socket | 2b |
| c9 one line per event with the listed fields; `bad_request` carries event and field, no value, once per minute per key; the serialized logs contain no token, IP or name; `/health` has the fields and no room code | `server/funnel.test.ts` | socket | 2b |

**PR 3:**
- c1, c1b, c2 and c3 are unit tests in `shared/bot.test.ts`.
- c5 is a unit test in `shared/cards-text.test.ts`.
- c4: paste `npm run sim -- 200` into the PR body; the existing fuzz-lite also runs.

**PR 4**
| Criterion | File | Kind |
| --- | --- | --- |
| c1 `passPromise`: `'tie'` and `'win'` boards, and `null` before the opponent passes | `shared/pass.test.ts` | unit |
| c2 How to play and the Round 1 chip show the `RULES` values (e2e imports `shared/cards`) | `e2e/demo-surface.spec.ts` | e2e |
| c3 dry-pass Round 1; once `.banner-roundEnd .banner-sub` shows, it equals the `[data-value]` totals | same | e2e |
| c4 at `/`, 1 `.btn.dark.big` and no Invite; at `/?pvp=1`, Invite; a created `/r/CODE` shows Join in a second context | same | e2e |
| c5 the bot lobby has no Build deck or Use starter, and the chip text matches; with a saved `al:deck:COVEN`, no `lobby:deck` websocket frame is sent | same | e2e |
| c6 `/cards` shows no "ART PENDING" | same | e2e |
| c7 in a fresh context: modal, Got it, lobby; the second click and a reload go straight to the lobby | same | e2e |
| c8 no link if `FEEDBACK_URL === ''`; otherwise `href` and `target=_blank` on Home and the end screen | same | e2e |

**PR 5**
| Criterion | File | Kind |
| --- | --- | --- |
| c1/c3 classifier table: iPhone, Android phone and tablet, iPad UA, Mac UA with 5 touch points (short side 820 -> tablet, 390 -> phone), Mac, Windows touch laptop | `client/src/device.test.ts` | unit |
| c1 the gate shows at 844x390 and 390x844 (iPhone UA, `hasTouch`, `isMobile`), on an iPad profile, and with a Mac UA + `maxTouchPoints` 5 (`addInitScript`); text >= 14px; no request matches `/\/art\/(?!manifest\.json)/`; never at 1440x900 or 1280x600; "Copied" with clipboard permission, the URL input without it | `e2e/phone.spec.ts` | e2e |
| c2 Try anyway shows home; after a reload in the same tab, still home | same | e2e |
| c3 the first sent `40{...}` frame contains `"device":"phone"` | same | e2e |
| c4 `/` and `/r/ABCDE` have the four tags; the image URL is absolute, answers 200 and is naturally 1200x630 (loaded as `<img>`); https on the same origin when `E2E_BASE_URL` is set | `e2e/preview.spec.ts` | e2e |
| c5 the button is on home and in the match; the `requestFullscreen` stub is called; the `.stage` scale is 0.8 at 1280x720 | `e2e/recovery.spec.ts` | e2e |
| c6 `lostMatch`: restarted when `uptimeS * 1000 < now - lastSeenAt`; ended when the server is older than that, or when either input is null | `client/src/recovery.test.ts` | unit |
| c6 mid-match `stop('SIGTERM')` of a spawned `server/index.ts`, then spawn: RESTARTED within 10 s, URL `/`, no invite or expired text | `e2e/recovery.spec.ts` | e2e |
| c7 `BOT_IDLE_MS=1500` shows the idle message; `FAIL_BOT_TURN=1` shows the error message; no `.end-title` and no `.game`; the URL is `/` and `al:t:<CODE>` is gone | same | e2e |
| c8 server stopped, click: OFFLINE within 5 s; after spawn, the lobby appears without another click. Server up: a click right after `goto` reaches the lobby, and OFFLINE never shows | same | e2e |
| c9 `/#__crash` shows "Something went wrong" with both actions | same | e2e |
| - `MAX_SOCKETS_PER_IP=0`: Home shows "Too many connections from your network." within 5 s (needs 2b) | same | e2e |

**Fuzzer:** fuzz-lite stays as it is. `server/app.test.ts` adds one seeded property: for each event, 200 junk payloads never throw, and never change `/health.rooms` for an unseated socket. `shared/protocol.test.ts` adds the opposite property: every legal bot play parses unchanged (c2).

### Invariants
1. **Engine purity:**
   - bot.ts adds no randomness.
   - engine.ts:651 only reads constants.
   - PR 2 adds no randomness to shared/. Pre-existing and untouched: `createGame` defaults its seed with `Math.random` (engine.ts:104) when the caller passes none, as the server does today.
2. **Server authority:** every payload is parsed before use. The device class is a log-only hint. The per-IP key trusts only `X-Real-IP`, checked in production before the link is posted.
3. **No client rule numbers:** `totals()`, `passPromise()` and `RULES` replace every literal. PR 5 adds none; `lostMatch()` compares durations, not rules.
4. **Animation timings:** no new ones. `animTime` (index.ts:86-96, backlog N3) only moves, as the default `botDelayMs`.
5. **Card text:** PR 3, with a README sync test.
6. **Hidden information:**
   - The ended message carries that seat's own view (`viewFor`, or the last view it was already sent).
   - Log lines carry random ids, and `bad_request` lines carry field names, never values.
   - `/health` has counts and uptime only.
   - IPs stay in memory.

### Risks (ranked)
| # | Risk | Mitigation / fallback |
| --- | --- | --- |
| 1 | `X-Real-IP` is spoofable, or a CDN proxy makes everyone one IP | Spoof check after 2b deploys (Thu) and Mon: 41 sockets, judged by `connect_error` (ADR 0002). Fallback: `TRUST_PROXY=none` + `LIMIT_PER_IP=off`. The per-socket window, 2,000 sockets and 10,000 rooms still bound memory, but one script could fill a cap: a denial of service, not a crash. Domain set to DNS-only. |
| 2 | The reconnect path regresses: forfeit after a reconnect, F5 deletes the lobby, a toast to itself | The closures and the attach and drop bodies move unchanged. Reconnect tests (i)-(iii) and the reload e2e land in 2a's tests-first commit. |
| 3 | PR 2 slips past Thu | Shipped as 2a (every crash fix) and 2b. If 2b is late it merges Fri 10:00, and only PR 5's refusal check waits for it. PR 5 builds c6 and c8 against `server/index.ts`, which works before and after PR 2. |
| 4 | A new Round 1 exploit | No pre-approved lever: a gate of 2 opponent cards drops first-seat wins to 38.4%, near the rejected rule. A reported exploit goes through /bug with a new measurement. c1b pins the strongest-card line. |
| 5 | The c3 snapshot is missing in CI | qa commits the `.snap` with the tests-first commit, and review checks it. |
| 6 | Fullscreen or clipboard is flaky in headless | Stubs and permissions in tests; the real thing on Aiden's devices on Mon. |
| 7 | The og URL is wrong, or the preview is cached early | Check the og URLs in the served HTML after PR 5's first deploy (set `VITE_PUBLIC_ORIGIN` if they say localhost); the e2e build sets it to the server under test; release c4; never paste the link earlier. |
| 8 | The restart e2e is flaky (port reuse, signals, tsx boot) | Spawn `node --import tsx` directly, wait for `exit` before respawning, fail if the new child exits, poll `/health` for 20 s, one port per test, 1 worker. |
| 9 | An exception escapes the guarded paths | The process logs it and exits 1. Railway's On Failure policy restarts it in seconds (at most 10 restarts on the default policy), and players see RESTARTED. Each boot writes a `server_start` line, so the "0 process exits" guardrail is countable. |
| 10 | Old clients see a frozen board on a server-ended match, between the 2a and PR 5 deploys | The toast explains it, and there is no public link before PR 5. |
| 11 | The device gate misclassifies (Chromebook or Surface tablet mode, Firefox on touch laptops, odd UAs) | "Try anyway" always works, and `connect` logs show the device mix. |

## Design challenge
Red-team challenged the design on Tue Oct 6: 9 objections, an alternative, 5 cuts and 8 assumptions. The architect checked each claim against main (`t1-test-gates`), node_modules (socket.io 4.8.4, tsx 4.23) and Railway's docs, and re-ran red-team's bot and README scripts. Changes to text above "Design" went to the orchestrator.

| # | Objection (one line) | Ruling | What changed |
| --- | --- | --- | --- |
| 1 | Blocker: the reconnect and reload path is rewritten with no test | Accept | Closures and attach/drop bodies kept (see Alt). Deletion only in `release()`, never on disconnect; no toast to the same socket. Reconnect tests (i)-(iii) and a reload e2e in 2a |
| 2 | The ADR 0002 spoof check can't pass, and its fallback unbounds sockets | Accept, except the global create rate | 41 sockets judged by `connect_error` with a timeout; a 2,000-socket cap that survives `LIMIT_PER_IP=off`. No global create rate: a flooder spends it and locks visitors out just as the room cap does, and `maxRooms` already bounds memory. Release c2 wording sent to the orchestrator |
| 3 | The 40-per-IP cap counts tabs, refuses them silently, and its counter can leak | Accept | Verified: CONNECT_ERROR destroys the client socket; a socket closed in the middleware fires no disconnect. Live count; PR 5 shows the refusal and reconnects after 10 s; cycle and 41st-socket tests. 40 kept (under 50 players expected) |
| 4 | PR 5 shows the wrong message: lid closed, idle end plus a blip, an early click | Accept | `lostMatch()` against `/health.uptimeS` (vitest); `ended` clears the token and URL; no `!connected` fast path (verified: timed-out emits leave the buffer); one `connect` listener reading a ref |
| 5 | PR 5's flaky half waits for PR 2, and PR 2 is one large review | Accept | c6 and c8 spawn `server/index.ts`. PR 2 ships as 2a and 2b (week plan sent to the orchestrator) |
| 6 | The seams can't reach a throw after a state change; parser rejections leave no trace | Accept, with a different seam | `hooks.onView` instead of a throwing `botDelayMs`: one seam covers a throw after `applyAction` and a throwing `endByServer`. `seat.lastView` fallback. Bot-play round-trip property. Rate-limited `bad_request` line |
| 7 | The bot numbers measure the old path, and risk 3's lever doesn't work | Accept | Re-ran: strongest card then pass 32.8% today, 87.9% proposed; a 2-card gate gives first seat 38.4%. c1 at 98% and new c1b at 85% (AC change sent to the orchestrator). Risk rewritten |
| 8 | Day-1 failures: og:image port, README dashes, npx signals | Accept all three | Verified: 5 README rows read `—`. PR 5 owns `playwright.config.ts`; `''` maps to `—`; spawn `node --import tsx`, wait for `exit` |
| 9 | A process that never exits makes the guardrail meaningless | Accept | Verified: Railway's healthcheck runs at deploy only. `uncaughtException` logs, then `exit(1)`; rejections log only; `io.use` body guarded |
| Alt | Thin PR 2 with limits read from live state | Accept in part | Closures kept and sockets per IP counted live. Windows stay for creates: a live-room cap would let one socket churn 1,000 creates (each release deletes the bot room), which c4 forbids |
| Cut 1 | `ServerOptions.random` and the explicit seed | Accept | Removed. All 20,000 seeded opening hands hold a no-target unit, so tests don't need a seed |
| Cut 2 | Session state in `socket.data` | Accept | See Alt |
| Cut 3 | 70-socket spoof mode | Accept | 41 sockets |
| Cut 4 | The c3 snapshot | Reject | It is AC c3's literal test. "Holds by construction" is the claim the snapshot checks; a `totals = score` unit test would miss a later edit to the R2/R3 branch |
| Cut 5 | The per-socket create window | Reject | It stops one runaway tab spending its NAT's 60/min (c4's 20-socket case). Reconnect bypass is the per-IP limit's job |
| A1 | IPv6 /64 | Accept | `ipKey()` keys IPv6 on its /64 |
| A2 | Railway healthcheck after go-live | Verified: deploy only | Drives #9 |
| A3 | npx/tsx SIGTERM | Moot | node spawned directly |
| A4 | `(pointer: coarse)` on Windows touch devices | No change | Named in risk 11; "Try anyway" covers it |
| A5 | iPhone "Request Desktop Website" counted as tablet | Accept | Rule 2: short side under 600 -> phone; one classifier row |
| A6 | Thu-Fri old-client window | No change | Risk 10; no public link before PR 5 |
| A7 | Preview fetchers and the limits | Agree | None |
| A8 | Sockets, not rooms, are the unbounded memory | Accept | 2,000-socket cap |
