# COLLECTION-V1 - Players choose their cards (vs the bot)

Size: L (epic, delivered as 5 M items: CV-1 to CV-5)    Owner: product-strategist    Status: draft, revised after red-team
Written Wed 2026-10-07 against main 568b713, from Aiden's direction of Oct 7. Revised the same day to the orchestrator's rulings on red-team's challenge. Storage, the player key, match records and replay are designed in docs/specs/data-platform.md (DP-n below); the 8 premades and the new cards they use come from game-designer's docs/specs/cards-v2.md. Section "Data to log" is this spec's input to the data platform.

## Read this first (blunt version)
- **Nobody has asked for this yet, because nobody has played yet.** The demo (Milestone 2) is not public. We have no data on whether players return after one match. A deck builder only matters to a player who comes back. If players don't come back, choosing cards won't fix that; the core loop or the bot will.
- **So the order matters more than the features.** Premades and the picker ship first (CV-2, CV-3): they are the cheapest real choice, they need no database, they show off the growing pool, and they give the bot variety. Match records (CV-1) follow once the data platform's recorder and database exist (DP-2, DP-3). The free builder (CV-4, CV-5) comes last, on Aiden's call (see "Before CV-4").
- **There is no baseline to beat, and there won't be for a while.** With the demo private, any return-rate gate would wait on a handful of players. Numeric targets and the gate math start once 50+ players have returned on a second day; until then, Aiden decides from raw counts and feedback.
- **Against a bot, unlocks only take fun away.** There is no opponent to protect from a stronger deck. Progression is an economy to design and balance, and it makes losing a device painful, which would force accounts early. Everything is open in v1.
- **Human match logs will be small for bot training.** At tens or hundreds of players, a trained model will learn mostly from self-play. What human logs must give it is exact, legal, replayable matches for evaluation, plus a record of how humans actually play.

## Player problem
A solo player who has finished a few matches against the bot wants to play a different way: a different plan, a card they liked, a deck they shaped themselves. Today every bot match uses one of four fixed starter decks (the server enforces it, DM-8), so after a handful of matches there is nothing new to try. The other cards are visible on /cards but can never be played against the bot.

Who has it: the returning player, from about their third match on. A first-time visitor does not have this problem, and must not pay for the solution: their path to a first match stays as short as today.

## Recommended model
1. **Everything open, premades first, free builder second.** Every card in the pool can go in a deck from day one. Players start from curated premade decks, two per house (cards-v2.md), and later copy and edit any of them in a free builder.
2. **No unlocks, no rewards, no currency in v1.** After a match the player gets the next action: play again with this deck, change deck, or (from CV-4) edit it.
3. **Decks live in the browser; deck codes move them.** Saved decks stay on the device. A deck code carries a deck to a new device or a friend. No server-stored decks until accounts. From CV-1, the server issues an anonymous player key and records every match against it; accounts later claim that history.

**The cheapest version that delivers the value is CV-2 + CV-3: eight tuned premades in a picker.** It gives a real choice (4 houses x 2 plans), shows off new cards, needs no storage at all, and keeps every reachable deck balance-tested. The free builder serves the engaged minority.

### Options considered
| Option | Value vs the bot | Cost | Verdict |
| --- | --- | --- | --- |
| Starters only (today) | One choice: house | 0 | Runs out after a few matches. |
| Premade archetype decks | A real choice; every deck is tuned; teaches the pool | Content (cards-v2), a picker, small server change | **Do first (CV-2, CV-3).** |
| Free builder, all cards open | Full expression; the pool's growth reaches players at once | Per-card tests for the whole pool (T3), builder UX at both viewports, rule-change handling | **Do last (CV-4, CV-5), on Aiden's call.** |
| Unlocks / progression | A reason to return, a paced introduction to a big pool | Economy design, reward-rate tuning, server-stored collections, accounts to protect progress, biased card stats | **Not in v1.** Revisit with accounts, if the data shows players leave for lack of goals rather than a weak core loop. The "big pool overwhelms newcomers" problem is solved more cheaply: the builder stays off the first-run path. |

### Before CV-4
- **Hard prerequisites:** T3 (per-card tests for the whole pool) and CV-1 live, so that every custom-deck match is recorded as `custom` from its first day.
- **The decision is Aiden's,** from raw counts (matches per player, distinct premades per player) and feedback.
- **The numeric gate is parked** until 50+ players have returned on a second day. Then: build CV-4 if at least 30% of returning players pick two or more different premades; look at the bot and the core loop instead if fewer than 15% of players who finish a match start a third one.

## Identity without accounts
- **The player key** is issued by the server on first connection, HMAC-signed so the server can tell its own keys from forgeries, and kept by the browser (design: data-platform.md). The database stores a player id derived from it, never the key. The key is a credential: whoever holds it can later claim that history into an account, so it never appears in a log line, a URL, or any payload to another client.
- **Where things live:**
  - Server database (from CV-1): the player id and every match record (decks, actions, outcome). Card stats are derived from the records.
  - Browser: the player key, saved decks (CV-4), the last deck used (CV-3).
  - Server-stored decks wait for accounts. Until then the key is exactly as device-bound as the browser's storage, so moving decks to the server buys no cross-device benefit and costs a deck API.
- **New device or cleared browser:** a new key, a fresh start. Because everything is open, the player loses nothing they can't rebuild: premades are always there, and their own decks come over by deck code (CV-5). Their match history stays under the old id with no expiry; an account claim merges it whenever accounts arrive.
- **Storage blocked** (private windows, some in-app browsers): the game still plays. The key lasts for the tab, decks can't be saved, and the player is told so and offered the deck code.

## Flows
1. **Pick a deck.** Play vs Bot (first time: How to play, as today) opens the deck picker. It lists the premades grouped by house, plus the player's saved decks from CV-4. One deck is already selected: the last one played, or the default starter. The house follows from the deck; there is no separate house step. Start begins the match.
2. **Play the bot.** The server deals the chosen deck. The bot gets a premade of another house (section "What the bot plays"). The player sees the bot's house and deck name.
3. **After the match.** No rewards. The end screen offers Play again (same deck, new bot deck), Change deck (back to the picker) and, from CV-4, Edit this deck.
4. **Edit a deck (CV-4).** From the picker: "Copy and edit" a premade or saved deck, or start empty. Every card of the house plus Neutral is available. The builder shows the deck's legality live, from `validateDeck`. Save under a name. An illegal deck can be saved but not started.
5. **Validation is the server's.** The client's checks are for the player's convenience. The server validates every list it is asked to deal with the same shared rules, and refuses an illegal one with the reason.
6. **Import / export (CV-5).** Any premade or saved deck exports to a short text code. Pasting a code imports it as a saved deck, legal or not; an illegal one shows why.

## What the bot plays
- **Its deck:** a premade marked bot-eligible, from a house other than the player's, chosen by the server for each match. Never the player's own list, never a custom deck.
- **Only legal decks, ever.** Every bot-eligible premade passes `validateDeck` in CI. At match start the server validates the bot's deck exactly as it validates a human's. A failing deck is never dealt: the server picks another eligible one and writes an `error` log line.
- **Difficulty is a future hook, not a feature.** v1 has one bot profile: today's policy plus the bot-eligible deck list. Every match record (from CV-1) names the profile and its version. A tier or a trained model later becomes a new profile, so its results are separable from day one. Players choose nothing about the bot in v1.
- **Its win rate against humans is not a number we trust yet.** Today's lookahead clones the full state and foresees its own draws. Bot-vs-human win rates are read only from the determinized bot's version on (data-platform DP-1); earlier versions are excluded by their profile version.

## Acceptance criteria
Five M items. Each one's criteria are testable from outside the code: by the server's acks, log lines and match records, the protocol, the shared registry, or what the player sees.

### CV-2 - Premade decks and the bot's deck
M · shared (deck registry, content) + server · **ships first, no database** · lists from cards-v2.md (game-designer); engine-dev and server-dev build. The ready-with-premade-id protocol change is designed by the architect before this item starts.
1. Given the deck registry in shared/, then it holds at least two decks per house, each with a stable id, name, house, a one-line plan written by game-designer, its list, a bot-eligible flag and a version. The four starters are four of them; their lists change only as cards-v2.md says. A vitest over the whole registry finds every list legal under `validateDeck`.
2. Given a premade, then its version is a hash of its decklist: changing one card changes the version, and changing its name or plan does not. A vitest asserts both.
3. Given each new premade, then its PR carries a game-designer sim report: over at least 2,000 games per pairing, its win rate against every other premade is between 40% and 60% (game-designer may tighten this).
4. Given every card in any premade, then it has a per-card test of what its text says, and the text matches the engine (invariant 5). This pulls part of T3 forward for the cards the premades use.
5. Given a bot room, when the human readies with a premade id, then the match is dealt from exactly that list. An unknown id, or a raw card list, is refused with an ack error (DM-8 still holds for lists until CV-4). A client that sends no deck plays its house's starter, so today's client keeps working.
6. Given 400 bot matches, then the bot's deck is always a bot-eligible premade of a house other than the human's, and every such deck is chosen at least once. The client receives the bot's house and deck name, never its list.
7. Given a registry with one deliberately illegal bot-eligible deck (a test fixture), then the server never deals it: it picks another eligible deck and writes one `error` line. With no eligible deck left, the match does not start and the player sees "The bot can't play right now. Try again in a minute."

### CV-3 - The deck picker
M · client only · after CV-2, no database · Aiden designs the visuals; this item specifies behaviour.
1. Given a fresh browser, when the player clicks Play vs Bot and dismisses How to play, then a deck is already selected and one click starts the match: no more clicks to a first match than today.
2. Given the registry gains a premade, then the picker shows it with no client change. The deck names, houses, plans and lists all come from shared/.
3. Given any premade in the picker, then the player can read its full card list and each card's rules text without hover or right-click, at 12 CSS px or more at inner 1366x650 (C12's standard).
4. Given the player finished a match with deck X, when they next click Play vs Bot in that browser, then X is preselected.
5. Given the end screen, then Play again starts a new match with the same deck, and Change deck opens the picker with that deck selected.
6. Given the lobby during a match, then it names the player's deck and the bot's house and deck name.
7. Given 844x390 after Try anyway, and 1440x900, then criteria 1-5 work with taps or clicks alone, with tap targets of 44 px or more. The e2e smoke picks a non-default premade and still reaches the end screen.

### CV-1 - Anonymous player and the match record
M · server + data (one small client change: keep the key) · **after data-platform DP-2 (recorder) and DP-3 (Postgres)**; implements the player key as data-platform.md designs it (one owner: if the data platform keeps the key as its own item, CV-1 consumes it instead of rebuilding it).
1. Given a fresh browser profile, when the player finishes two bot matches, then both match records carry the same player id, and a second browser profile's match carries a different one.
2. Given a client that presents a key the server never issued (a well-formed but unsigned or wrongly signed key), or a malformed one, when it starts a bot match, then the match starts normally under a newly issued key and id. The key appears in no log line, no URL and no payload sent to another socket.
3. Given 50 finished bot matches, when each is replayed with the engine from its stored record (seed, decks, first player, actions), then every replay ends with exactly the recorded round scores and winner.
4. Given matches that end by forfeit, leave, disconnect, idle or error, then each has exactly one end record with that reason. A match cut off by a restart is written as lost at SIGTERM. A crash with no SIGTERM leaves only log lines (crash-lost rows need a heartbeat, with O2). No boot-time sweep: Railway overlaps deploys, so it would mark the old instance's live matches lost.
5. Given the database is unreachable, when a player plays the bot, then the match plays normally and on time, and the failure shows in `error` log lines and /health. Recording never blocks or delays play.
6. Given any stored row, then it contains no IP address, user-agent string, player name, seat token or player key, and no socket payload contains the seed (the AG-6 `viewFor()` fuzz still passes).
7. Every match record names the build SHA, the pool version, the bot profile with its version, and for each seat a `deck_source` of `premade:<id>@<version>` (CV-2 c2) or `custom`.

### CV-4 - The free builder against the bot
M · client + server · **on Aiden's call** (see "Before CV-4"), after T3 (per-card tests for the whole pool; E1 preferred) and CV-1 · absorbs C16 (the builder's readability).
1. Given the builder for a house, then every card of that house plus Neutral is available with no unlock. Limits (size, copies per tier, Legends, Rares) come from `DECK_RULES`, and a blocked add shows the reason from shared/.
2. Given "Copy and edit" on a premade, when the player changes cards and saves under a name, then the deck appears in the picker after a reload of the same browser. A browser holds at least 30 saved decks.
3. Given a bot room, when the human readies with any legal custom list, then the match is dealt from exactly that list (DM-8 reversed for legal lists), and its record's `deck_source` is `custom`, even when the list equals a premade's.
4. Given forged lists sent straight to the socket (24 cards, too many copies, a card of another house, an unknown id, too many Legends), then each is refused with `validateDeck`'s reason as an ack error, and no match starts with it.
5. Given a saved deck that a rule or card change has made illegal, then the picker shows it as illegal with the reason, it can be edited, and it cannot be started. It is never changed silently.
6. Given both viewports, then the player can add, remove and read a card's rules text by tap or click alone: no right-click, no hover-only information. Rules text reads at 12 CSS px or more at inner 1366x650.
7. Given storage is blocked, then the builder works for that tab, and saving tells the player decks can't be kept in this browser and offers the deck code (once CV-5 is in).

### CV-5 - Deck codes
M · shared (a pure codec) + client · after CV-4. No protocol change: a code decodes to a list in the client, and the server validates the list as in CV-4.
1. Given 1,000 random legal decks, when each is exported and imported in a fresh browser profile, then the house and list come back identical.
2. Given any legal deck, then its code is at most 100 characters of URL-safe text, and an import still works with spaces or line breaks around the code.
3. Given a code made before a card was added to the pool, when it is imported after, then it decodes to the same deck. A code naming a card that no longer exists imports with a message that names the missing card.
4. Given a garbled, truncated or unknown-version code, then import shows a specific message and nothing crashes. A decodable but illegal deck imports as an illegal saved deck with the reason (CV-4 c5).
5. Given any code, then it encodes the deck and a format version only: no player key or id, no name, nothing else.
6. Given a blocked clipboard (in-app browsers), then export shows the code as selectable text, as DM-5's Copy link does. Both viewports.

## Phone and desktop
Phones and tablets still get the DM-5 "made for desktop" screen; this epic doesn't change that, and the mobile layout stays C1. Behind "Try anyway", these flows must still work by touch.
| Screen | 1440x900 (and inner 1366x650) | 844x390 (after Try anyway) |
| --- | --- | --- |
| Deck picker (CV-3) | Every premade and saved deck is visible or one scroll away. A deck's list and card text are readable at 12 CSS px or more at 1366x650. | Fully usable by tap: select, read a list, read a card, Start. Targets of 44 px or more. Reading may need a tap to open a card. |
| End screen (CV-3) | Play again, Change deck, and Edit this deck from CV-4. | The same actions by tap. |
| Builder (CV-4) | Add, remove and read by click; legality is always visible. | Add, remove and read by tap; no right-click, no hover. Comfort is C1's job; operability is this epic's. |
| Deck codes (CV-5) | Export copies, import pastes. | The same, with the selectable-text fallback. |

## Data to log
The hand-off to data-platform.md, which owns the schema and may store or derive each item. Rules for every item:
- Keyed by the player id or the match id. No IP, user agent, name, token or player key.
- The seed is stored only on the server and never leaves it.
- The bot's decisions arrive as ordinary actions, so a replay never needs the bot's randomness.
- Anything a replay of the match record can derive is not logged separately.

### Stored (the match record)
| Event | When | Carries |
| --- | --- | --- |
| `match_start` | The engine deals | Match id, room id, match number in the room; per seat: player id or bot profile and version, device class, house, the full 25-card list in dealt order, `deck_source` (`premade:<id>@<version>` or `custom`); plus first player, seed, build SHA, pool version |
| `action` | Every action the server accepts in a match | Match id, sequence number, seat, the action, and wall time. For humans this must yield the ms since their turn began; it is labelled **wall time**, because it includes the client's animation playback (the server knows no animation timings, invariant 4), so it is not think time. |
| `match_end` | Exactly once per match | Today's fields (reason, winner, round scores, duration, plays) plus the player ids |
| Lost match | At SIGTERM (a crash leaves log lines only) | Match id, marked lost |

### Derived by replay, not logged
- Round ends: totals, round winner or tie, who passed first, cards left in each hand.
- Draws, plays per card and the round of each play.
- A player's first appearance (their first `match_start`) and their active days (from `match_start` times). A connection that never starts a match leaves no record, by design.

### Server log lines only (not stored)
- Refused actions, with the reason.
- `deck_rejected`: source and reason code; never the list.
- `bot_deck_skipped`: premade id, version and reason (CV-2 c7).

### Questions the data must answer cheaply
1. Win rate against the bot by `deck_source` (premade id and version, or the canonical list of a custom deck), with counts.
2. Per card and per pool version:
   - how often it is in a deck, drawn and played, and in which round;
   - the win rate when it is in the deck and when it is played.
3. Which cards players add to, and cut from, the premade they started from (CV-4). The server can find the nearest premade; no builder click logging is needed.
4. Per player: matches played, distinct days, decks tried, and returns within 7 days.
5. Per bot profile and deck: an exact replay of any match (each match's bug report and the trained model's evaluation set), and the win rate against humans, read only from the determinized bot's version on (data-platform DP-1).

## Out of scope
- **Unlocks, progression, rewards and currency.** This is the tempting cut. It is the obvious way to make players return, but against a bot it only gates fun. It needs an economy, and it forces accounts to protect progress. Revisit with accounts, on evidence.
- **Deck record on the end screen** ("this deck: 7-3"). Also tempting and cheap once CV-1 exists, but it is a database read path and a new screen element. It comes after CV-4.
- **Server-stored decks,** accounts, login, claiming an anonymous id, and cross-device sync.
- **A retention sweep** of anonymous history. History is kept until an account claim merges it; revisit with accounts.
- **Numeric return-rate targets and the CV-4 gate math** until 50+ players have returned on a second day.
- Multiplayer: PvP keeps today's lobby and builder at `/?pvp=1`, unchanged and untested by this epic. Also out: quick match (N1), trading, payments and any shop.
- Deck share links (`/d/<code>`). The code alone covers v1.
- Player-chosen bot difficulty; the trained bot model (its own session); the bot playing custom decks or mirror houses.
- New cards: cards-v2.md owns them. This epic only consumes its premade lists.
- The card-stats dashboard (G1), the mobile layout (C1), visual design (Aiden), and "forget me" deletion (no personal data is stored; revisit with accounts).

## Success metric
Measurable from CV-1 on; before that, only DM-6's match log lines exist.
- **Primary: the 7-day return rate.** The share of anonymous players who finish a bot match and start another on a different day within 7 days.
  - Events: `match_start`, `match_end`, keyed by player id, on two distinct days.
  - No baseline and no target until 50+ players have returned on a second day; with fewer, read the raw counts beside the feedback form. CV-2 and CV-3 ship before CV-1, so there will be no starters-only baseline; that is accepted.
- **Secondary: choice is used.** Among players with 3 or more matches:
  - the share who played two or more different decks;
  - after CV-4, the share of their matches with `deck_source = custom`.
  - Events: `match_start`'s `deck_source`. Targets (30% and 25%) apply once the 50-player threshold is met.
- **Guardrails:**
  - First-match completion (the demo metric) does not drop after CV-3; the picker must not slow a newcomer.
  - Zero matches dealt from an illegal deck, for humans or the bot (the `deck_rejected` and `bot_deck_skipped` log lines, and the CV-1 c3 replay check).
  - Zero server exits caused by this epic.

## Dependencies and open questions
1. **Order:** CV-2 -> CV-3 (no database). CV-1 after data-platform DP-2 and DP-3, and may run beside CV-3 (no shared files). CV-4 after T3 and CV-1, on Aiden's call. CV-5 after CV-4.
2. **cards-v2.md** supplies CV-2's lists. A premade can only enter the registry once every card in it is in the engine with its per-card test (CV-2 c4).
3. **T3, per-card tests for the whole pool,** must land before CV-4. Ideally E1 (the effect registry) lands too, because the builder makes every card reachable. Known text drift on reachable cards then includes E6 and E8, and Hacker.
4. **Protocol.** CV-2's premade id on ready (and the bot's deck name to the client) and CV-1's player key are protocol changes. The key is designed in data-platform.md; the architect designs the premade-id contract before CV-2 starts, so the M items implement a contract that is already decided.
5. **For Aiden:** does CV-2 wait for cards-v2's new cards, or ship the registry now with second decks built from today's pool and swap in cards-v2's lists as their cards land (each swap is a new version, so stats stay separable)? Recommended: ship now.
6. **For Aiden:** the name and plan of each premade (game-designer proposes them in cards-v2.md), and whether the bot's deck name is shown. The default is to show it, because premade lists are public anyway.
7. **For Aiden:** CV-4 on your call once T3 and CV-1 are in, or wait for the 50-returning-player gate? The spec assumes your call.

<!-- architect appends "## Design" below; red-team objections and responses go under "## Challenge" -->

## Decisions (Oct 7, orchestrator, on Aiden's delegation)
1. CV-2 ships with cards-v2's wave-1 decklists, not today's pool: the four new archetypes need the new cards to play differently. Wave 1 is built the same night, so the wait is short. Later swaps get a new premade version.
2. game-designer names the 8 premades and writes their 2-line plans (in cards-v2.md). The bot's deck name is shown in the match.
3. CV-4 (free builder) starts on Aiden's go once T3 and CV-1 are in. There is no 50-returning-player gate: with no public players yet it would block indefinitely.
4. Lost matches are written at SIGTERM only, per architect's rebuttal (data-platform.md; ADR docs/decisions/0003-postgres-match-records.md).
