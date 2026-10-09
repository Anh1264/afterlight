# BL - Bot difficulty levels: Easy, Medium, Hard

Size: L (protocol + shared + server + client) -> BL-1 (M), BL-2 (M), BL-3 (S)    Owner: product-strategist    Status: draft
Written Thu 2026-10-08 against origin/main after PR 22 (Level 2 search merged, not wired in), from Aiden's request of Oct 8. Supersedes collection-v1.md's out-of-scope line "player-chosen bot difficulty"; its "a tier later becomes a new profile" rule still holds. The architect appends the Design and the teaching walkthrough.

## Read this first (blunt version)
- **Nobody has this problem yet: no player has played.** The case for building it before the invite is structural, not data: one bot strength cannot fit both a first-time visitor and a card-game regular, and the one we have is the weakest kind of good (one move of lookahead, passing by rules of thumb; G2 calls it exploitable).
- **The real work is Hard, not the picker.** Hard thinks for ~0.6-0.7 s per move. Today the bot decides synchronously in the room timer (server/app.ts:350-355), so one Hard bot thinking would freeze every other room for that long. Running bots off the main thread is the price of Hard, and the same plumbing is what the trained bot needs later.
- **Easy is the most speculative level.** Medium may already be beatable by newcomers; we won't know until per-level win rates exist. Easy is still in because it is cheap (a variant of Medium) once the interface exists.
- **Difficulty comes from skill only.** Every level plays the same decks and knows the same things. No level ever sees your hand, the deck order or the seed. Today's bots each leak a little (below); this spec closes it for all three.

## What the three levels are
**Easy - the eager beginner.** Built from Medium's move scorer, so it still recognises which card adds the most to its board. Two things are taken away. It does not plan its passes: it fights for every round until it is ahead or out of cards, so it overspends in Round 1 and runs dry in Round 3. And it sometimes plays its second- or third-best card instead of its best. What a player feels: sensible-looking plays, often a Round 1 win, then it runs out of steam. You beat it by learning the game's central skill, card advantage: let it overspend, then take the last two rounds with more cards. Its mistakes are the ones a new human makes, so they look human, not broken.

**Medium - the one-move thinker.** Today's bot, unchanged in strength (Level 1, shared/bot.ts). For every card it could play, in every row and with every target, it imagines the board right after that play and scores it: the lead on the board, plus 4 points per card in hand, plus lingering effects (Grow, Poison, Shield). It plays the highest score. When to pass is decided by hand-written rules of thumb (pass after winning a round, stop once ahead with enough cards down, take Round 1 cheaply when you pass early), some with a coin flip. It never imagines your reply. What a player feels: solid, punishes careless play, but predictable; once you learn its passing habits you can farm them.

**Hard - the planner.** Level 2 (shared/bot-mcts.ts). It cannot see your hand, so it imagines one: it deals you a plausible random hand from the cards you could be holding. Then it plays the whole rest of the match out in its head at high speed, with Medium playing both sides, and notes who won. It repeats this about 160 times per move, with a different imagined hand each time, and spreads those tries over its 6-8 most promising moves, passing always included: moves that keep winning get more tries, but every move keeps getting checked. It plays the move that was tried most. Because it plays matches to the end, it understands what Medium cannot: whether passing now wins the match two rounds later. What a player feels: it passes at the right moments, saves strong cards and rarely throws a round away. Known blind spot: in each imagined match it sees your imagined hand fully, so it slightly overrates plays that only work if it knows your cards ("strategy fusion"; ISMCTS is the fix, out of scope here).

**Why the gaps are where they are.** Each step adds exactly one ability to the level below. Easy to Medium adds discipline: the same eye for a good card, plus deliberate passing and always the best card. Medium to Hard adds foresight: it plays the match out to the end instead of looking one move ahead. Because each level is built from the one below, a higher level beats a lower one reliably, and the simulator can prove it (criterion 3). The trained bot will slot in as a fourth policy behind the same interface, and the same ladder tells us where it ranks.

### Options weighed
| Choice | Options | Recommendation |
| --- | --- | --- |
| What makes Easy easy | (a) a random move some of the time: cheap, but the mistakes look like bugs (a Legend for nothing). (b) a weighted pick among its top few plays: plausible near-misses, one tuning knob, but too subtle to learn from. (c) naive passing: fights every round, never saves cards; loses on card advantage, the thing the game teaches. (d) a handicap (weaker deck, fewer cards): not skill, and it corrupts per-deck stats. | **(c) plus a mild (b)**, tuned to criterion 3's band. Reject (a) as the main mechanism and (d) outright. |
| Medium | Today's Level 1, run on the fair view of the game (data-platform 3e: 0 of 42,364 starter decisions change). | As is. |
| Hard | (1) today's Level 2 at 160 iterations: ~90% vs Level 1 (measured with the leaky determinize; re-measure). (2) more iterations within the time budget: the knob exists; measure 80/160/320 for diminishing returns. (3) ISMCTS: removes strategy fusion; a new search, unknown gain. | **(1), with (2) as a measurement:** pick the largest iteration count that holds criterion 6. Hard already clears the ladder; whether humans find it fun is the unknown, and only player data answers that. Defer (3). |

### What every level may know
The bot sees what a human in its seat would see: both boards, both discards, hand counts, its own hand, its own remaining deck as an unordered list, and what is public about your deck.
- **Today's leaks:** Medium's lookahead runs on a full copy of the real game, so it foresees its own draws (bot.ts:74; negligible on starters, data-platform 3e). Hard's `determinize` (bot-mcts.ts:41-50) reshuffles your actual hand and deck together, so it knows your exact remaining cards: harmless while every bot match uses starters or premades (public lists), a real leak once custom decks reach bot rooms (CV-4).
- **One shared `determinize`** serves all three levels and data-platform DP-1 (one implementation, one property test).
- **About your deck,** the bot knows your premade's list when you play one, as you are shown its deck name (collection-v1 decision 2), and only your house's card pool when you play a custom deck. This is open decision 2.

## Acceptance criteria
1. **Picker.** Given the bot lobby at either viewport, then Easy, Medium and Hard are offered with a one-line description each, one is preselected (first visit: the default from open decision 1; afterwards: the last level played in this browser), and Start match begins at that level with no more clicks than today. During the match, and in the lobby, the bot is labelled with its level. Play again keeps the level.
2. **Protocol.** Given a bot room, when a client requests a level outside the known set, then it is refused with an ack error and no match starts. When a client sends no level (a cached old client during a deploy), then the match runs at Medium. The level cannot change once a match has started.
3. **Ladder.** Given `npm run sim:bots` over at least 400 games per pairing (seats and first player alternated, every house pairing, fixed seeds, Hard at its production iteration budget), then: Hard beats Medium at 75% or more with the 95% CI lower bound at 70% or more; Medium beats Easy at between 65% and 85% (CI lower bound 60% or more; game-designer may retune the band); Easy beats a uniform-random legal-action bot at 80% or more. Draws count half. The report is attached to the BL-1 PR and rerun on every policy version bump.
4. **Fair play.** Given 200 seeded mid-match states and a fixed bot random seed, when the hidden information is replaced by any other arrangement consistent with what the bot may know (the opponent's hand and deck redealt with the same counts, the bot's own deck reordered, the engine RNG seed changed), then every level returns the identical action (Hard may run at a reduced iteration count for this test). All three levels are dealt decks by the same rule.
5. **No thrown matches.** Given 1,000 sim states where the opponent has passed, the bot is behind in a round it must win to stay in the match, and it holds a card that would put it strictly ahead, then no level passes. (Easy loses by overspending, never by giving up a won match.)
6. **Think time.** Given production, then Hard's per-decision think time is at most 1.5 s at p95 (read from the match_end field in criterion 8), and the bot's reply reaches the player no more than 1 s later at Hard than at Medium (p95). If a decision is not back within 3 s, or the policy errors, then the server plays Medium's move for that turn, writes one `bot_fallback` warn line, counts it on /health, and the match continues.
7. **No room waits for a bot.** Given a test policy that burns 2 s of CPU per decision, when 4 such bots think at once, then a human action in another room is acknowledged in under 100 ms and that room's Medium bot replies on its normal schedule. When the human forfeits or leaves while a bot is thinking, then the late answer is discarded: no action after the match end, no `error` line.
8. **Recorded and pluggable.** Every `match_start` and `match_end` line of a bot match names the bot as level plus policy version (e.g. `hard:mcts-1`; the record's later `bot_version`), and `match_end` adds the bot's mean and max think ms and its fallback count. A committed snapshot of each level's decisions on 50 seeded states fails `npm run check` when a decision changes without that level's version changing. A fake policy passed in through the server's options plays a full bot match and is recorded under its own id, with no other server change (the trained bot's entry point).

## Phone and desktop
Phones and tablets still get the DM-5 "made for desktop" screen; this is the flow behind Try anyway. The client ships a plain picker; Aiden restyles it in his design pass.
| Screen | 1440x900 (and inner 1366x650) | 844x390 (after Try anyway) |
| --- | --- | --- |
| Bot lobby | The three levels and their descriptions are visible together beside the house (later deck) choice, no scroll. Descriptions at 12 CSS px or more at 1366x650 (C12's standard). | The three levels and Start are reachable with at most one scroll. Tap targets of 44 px or more; level chosen by tap alone, no hover. |
| In match | The bot's name carries its level ("Bot · Hard"), readable without hover. | The same label, visible at the stage's phone scale. |
| End screen | Play again keeps the level. Changing level goes back through the lobby. | The same, by tap. |

## Out of scope
- **A stronger Hard (ISMCTS, deeper or smarter rollouts).** The tempting cut. Today's search already clears the ladder; extra strength is worth building only once humans show they beat or exploit Hard. Revisit when Hard's human win rate on players with 10+ matches falls below 50%, or feedback names an exploit.
- **Adaptive difficulty** (the bot eases off after you lose). Also tempting. It is a hidden handicap, players resent it when they notice, and it makes per-level win rates meaningless. Revisit with player ids, as a suggestion rather than a secret.
- Handicaps of any kind: weaker decks, fewer cards or any information advantage per level.
- Unlocking levels, ratings, leaderboards, "try Hard next" prompts.
- A hint or coach mode ("what would Hard play here?").
- A "thinking..." indicator, bot personalities, names or avatars per level (Aiden's design pass).
- The trained bot and a fourth "Expert" level: the bot department's session. This spec only provides the interface (criterion 8).
- Switching the balance sim (`npm run sim`) to Hard: hours per run; balance numbers stay on Medium. G2's sim-skew half remains open.
- Changing level mid-match; levels in PvP; the turn clock vs the bot (DM-2 stands).
- G3 (target-choice bias) and E3 (remove bot.ts's catch-and-skip): separate S items; they change Medium's version when they land.

## Success metric
Mostly measurable from day one: today's DM-6 `match_start`/`match_end` lines plus criterion 8's bot field. Cross-day questions need player ids (data-platform DP-2) and match records (DP-3).
- **Primary: the human win rate per level** over completed matches (`match_end` reason `normal`, `winner` vs `botSeat`, `bot`). Indicative bands, not targets until 100 completed matches per level: Easy 60-80%, Medium 35-55%, Hard 15-35%. A level outside its band is retuned; a version bump starts its count again.
- **Completion by level:** the share of matches ending `normal` rather than `forfeit`, `leave` or `idle`. Guardrail: Easy's and Medium's completion are not below the pre-BL demo rate.
- **Replay by level:** the share of matches followed by another in the same room (`rid`, `n` > 1). Which level players move to after a win or a loss needs a player id (DP-2); until then it is visible only within a room.
- **Level choice:** the share of first matches started at each level (needs first-visit marking: the player id from DP-2, or a `firstMatch` flag on `match_start` sent by the client).
- **Guardrails:** Hard's `bot_fallback` under 1% of its decisions; Hard p95 think time at most 1.5 s (criterion 6); zero server exits and zero `error` lines caused by bot thinking.

## Split
| Item | Area | Size | Covers | Notes |
| --- | --- | --- | --- | --- |
| BL-1 | shared | M | c3, c4, c5, c8 (snapshot) | One bot interface, the level registry with versions, the shared fair `determinize` (data-platform DP-1 consumes it, not a second copy), Easy, Hard's production config, the ladder report with CIs. |
| BL-2 | server + protocol | M | c2, c6, c7, c8 (log lines, fake policy) | The level in the bot-room protocol, bots off the main thread, the time cap and fallback, stale answers, log fields, /health counters. Owns shared/protocol.ts. |
| BL-3 | client | S | c1 | The plain picker, the in-match label, Play again keeping the level. After BL-2's protocol contract; parallel with the rest of BL-2. |
Order: BL-1, then BL-2 (BL-3 once BL-2's contract is fixed). Invite players only after all three, so the first human win rates are already split by level.

## Open decisions for Aiden
1. **Default level for a first visit.** Recommended: Medium, the bot the demo was tuned and tested against (DM-1). Easy is labelled for people new to card games. Alternative: Easy, so a newcomer's first match is a likely win.
2. **What the bot may know about your deck.** Recommended: your premade's or starter's list (public, and you are shown the bot's deck name), house pool only for custom decks. Stricter alternative: house pool always. That matches data-platform 3e as written, but Hard then plans against cards you don't have and gets weaker.
3. **Easy's weakness.** Recommended: naive passing plus an occasional second-best card. Alternative: pure random mistakes (cheaper, looks buggy).
4. **Hard's strength.** Recommended: today's Level 2 at the largest iteration count that fits 1.5 s p95. Alternative: build ISMCTS first (more work, unknown gain, no players yet to need it).
5. **The think-time budget** (1.5 s p95, 3 s cap, at most 1 s slower than Medium) is a feel call; tell us if Hard should visibly "take its time" or reply as fast as Medium.
6. **Labels and one-liners.** Easy / Medium / Hard, with descriptions such as "Learning the game", "Plays solid moves", "Plans ahead and passes well". Yours to restyle.

<!-- architect appends "## Design" below; red-team objections and responses go under "## Challenge" -->

## Design

### How the bots work (read this first)
Every bot answers one question, many times a match: *"what do I do now: which card, which row, which target, or pass?"* The three levels answer it with three ingredients, stacked:

```
                      the table as the bot is allowed to see it   (step 0, all levels)
                                       |
 Easy   = move scorer + naive passing + an occasional near-miss
 Medium = move scorer + rules-of-thumb passing                     (Easy + discipline)
 Hard   = Medium, played forward to the end of the match 160 times (Medium + foresight)
```

#### Step 0, all levels: the fair view (determinization)
A bot must not see your hand, your deck order or the dice (the engine's random seed). But the bot's thinking works by *simulating* the game, and the simulator needs a complete game state. So before every decision the bot builds an **imagined but plausible** complete state, called a *determinization* (making the unknown parts definite):
- Everything public is copied as is: both boards, both discards, round, wins, who passed, hand and deck sizes, its own hand.
- **Your hidden cards are re-dealt.** Your starter list is public: 25 known cards. The bot subtracts every one of your cards it has seen (on a board or in your discard). Say 9 are seen; the other 16 are your hand (4) plus your deck (12). The bot knows *which* 16 but not *where* they are, so it shuffles those 16 and deals 4 of them into your imagined hand. With a custom deck (later, CV-4) it doesn't know the list, so it fills the 16 with random cards from your house's pool, within the deck rules.
- **Its own deck is shuffled** (it knows what is left in it, not the order) and **the dice are re-rolled** (a fresh engine seed).

The result is one possible world. It is fair *by construction*: the bots only ever receive this imagined copy, never the real state, and the copy is built only from what a human in the bot's seat could know. A test proves it: scramble the hidden parts of a real state in any consistent way and the imagined copy, and therefore the move, comes out identical (criterion 4). Today's Hard does this step wrongly (bot-mcts.ts:41-50 reshuffles your *actual* hand and deck, so it knows your exact remaining cards), and today's Medium skips it (bot.ts:74 simulates on the real state). Measured on the prototype: the fair view changes **0 of 11,363** Medium decisions on starter decks, and Hard's moves become independent of the hidden information (0 of 200 differ under scrambling, against 71 of 200 for today's Hard).

#### Medium, the one-move thinker (shared/bot.ts, today's Level 1)
Built from `candidatePlays` (bot.ts:51-67), `evaluate` (bot.ts:11-28), `bestPlay` (bot.ts:69-83) and `decide` (bot.ts:132-162).
1. **List every legal play:** each card in hand, in each legal row, with each target choice (`candidatePlays`).
2. **Score each play one move ahead:** copy the board, make the play, and score the result with `evaluate`: my board total minus yours, plus 4 points per card I hold more than you (a card in hand is a future play), plus small amounts for lingering effects (a Grow unit is worth about 0.8 per turn left, Poison the reverse, Shield 0.6). The score of a play is how much it improves that number. Two nudges: hold Resolve cards until you pass (-2.5), don't spend a Legend in Round 1 (-1).
3. **Decide whether to pass, by rules of thumb** (bot.ts:141-160). The main ones: if you passed and I'm ahead, pass; if you passed and losing this round loses the match, play; if I already won a round and you haven't, pass ("dry pass"); if I'm ahead with two cards down and not short of cards, usually pass (80% coin).
4. Otherwise **play the best-scoring play.**

Worked example (a hand-built Round 2 position; numbers are the engine's). The bot (Ember) won Round 1. Your board: Bog Brute 4 (front) and Thornling 2 (back, Grow). The bot's board is empty, totals 0 to 6. Each side holds 4 cards; the bot's are Pyre Hound (6), Cinder Imp (3, Burn 2), Brimstone Ogre (8; its drawback burns the bot's own strongest other unit, and it has none) and Hellfire.

| Play | Score change | Why |
| --- | --- | --- |
| Brimstone Ogre | +4.8 | +8 power on the board, -4 for the card spent, and the Thornling keeps growing |
| Cinder Imp, burn Thornling | +4.2 | only +3 power, but it kills Thornling, so its future growth is gone too |
| Pyre Hound | +2.8 | +6 power, -4 for the card, Thornling still grows |
| Hellfire (best mode) | +1.2 | a spell: no power of its own |

Medium's best play is the Ogre, but step 3 fires first: it won a round and you haven't, so it **dry-passes**, conceding Round 2 to save its cards for Round 3. That rule is right on average and wrong here, which is the gap Hard closes.

#### Easy, the eager beginner (new shared/bot-easy.ts)
Built from the same scorer as Medium (a new `rankedPlays` in bot.ts that returns every play with `bestPlay`'s score, best first). Two abilities are taken away:
1. **No pass planning.** It passes only when it is ahead: always if you have passed, otherwise with a 25% chance each turn it is ahead. It never dry-passes and never counts cards, so it spends cards in Round 1 that it needs in Round 3.
2. **An occasional near-miss.** With a 20% chance it plays its 2nd or 3rd best *card* (that card's best row and target) instead of the best, but only if it scores within 4 points of the best (so it never wastes a Legend for nothing).
It never passes while behind if you have passed, so it never gives away a match it could take (criterion 5).

Same board: you haven't passed and Easy is behind, so it does not pass. 80% of the time it plays the Ogre; 20% of the time it considers its 2nd and 3rd best cards, Cinder Imp (+4.2) and Pyre Hound (+2.8), both within 4 of +4.8, and plays one of them. Either way it keeps fighting for Round 2, where Medium would have saved its cards.

#### Hard, the planner (shared/bot-mcts.ts, today's Level 2)
Built from `rootMoves` (bot-mcts.ts:55-72), `rollout` (:75-83) and `searchMcts` (:88-119). This family of methods is called *determinized Monte Carlo search* (Monte Carlo = learning from many random trials).
1. **Shortlist the moves** (`rootMoves`): pass, Medium's choice, and Medium's 6 best-scoring plays. This keeps the search on sensible moves.
2. **Repeat 160 times:**
   - **Imagine a world** (step 0 again, a fresh random one each time).
   - **Pick one shortlisted move to try, with UCB1** (below).
   - **Roll out:** make that move, then play the rest of the *whole match* at full speed with Medium playing both sides (about 4 ms per match), and record a win as 1, a draw as 0.5, a loss as 0.
3. **Play the move that was tried most often** (its *visit count*), not the one with the best average.

**UCB1** (Upper Confidence Bound) decides which move gets the next try. For move *i*:

```
score_i = (wins_i / tries_i)  +  c * sqrt( ln(total tries so far) / tries_i )        c = 0.7
           how good it looks       a bonus that is large while move i is under-tested
```

The first term exploits (try what's winning); the second explores (a move tried rarely gets a growing bonus, because `ln N` keeps rising while its own `tries_i` stays put). So good moves get most of the tries, and every move keeps getting rechecked, so an unlucky early streak can't bury a good move. Every move gets one try before any move gets a second (bot-mcts.ts:98).

**Why the most-tried move, not the best average?** A move with 3 tries and 3 wins has a perfect average and almost no evidence. UCB1 already sends tries to whatever keeps winning, so the visit count is a vote that has both a good average *and* enough evidence behind it.

Same board, 160 tries (prototype):

| Move | Tries | Win rate in its tries |
| --- | --- | --- |
| Cinder Imp, front row, burn Thornling | 47 | 69% |
| Cinder Imp, back row, burn Thornling | 40 | 66% |
| Brimstone Ogre, front | 34 | 63% |
| Pyre Hound, front / back | 14 / 14 | 50% / 46% |
| Pass (Medium's choice) | 8 | 31% |
| Brimstone Ogre, back | 3 | 0% |

Hard plays Cinder Imp. It found that dry-passing here wins about 31% of the imagined matches and fighting wins about 69%, and that killing the Thornling beats the bigger Ogre once the rest of the match is played out. UCB1 at work: at try 100, Pass (8 tries, 31%) scored 0.31 + 0.7 x sqrt(4.61 / 8) = 0.84 while Cinder Imp (30 tries, 69%) scored 0.69 + 0.7 x sqrt(4.61 / 30) = 0.96, so Cinder Imp got the next try. The 3-try Ogre-back row shows why averages over few tries mean little.

**Why search is stronger at passing.** Passing is a bet about the *future*: give up this round to have more cards later. Medium can only guess the value of a card kept, with "+4 per card" and its rules of thumb. Hard measures it: each rollout actually plays Rounds 2 and 3, so the cards it kept either win those rounds or they don't. That is exactly the decision Medium gets wrong in the example.

**Strategy fusion, and Hard's real limit.** In each imagined world the hidden cards are fixed, and a search that reads them can credit a move with "I'll play the right counter later", knowledge it will not have in the real game. Averaging over worlds then overrates moves that only work with perfect information. ISMCTS (search over *information sets*, the sets of worlds the bot can't tell apart) is the textbook fix. In our Hard the effect is mild, because the rollout player (Medium) never reads your hand; it survives only in small places, such as Medium's two-step lookahead seeing the imagined deck order (bot.ts:115-130). The larger limit is that **every imagined future is played by Medium on both sides**: Hard estimates "how does this go if we both play like Medium from here?". It cannot foresee a human who plays better than Medium. That is the honest ceiling of this design and the reason a trained bot is the next step, not more iterations (320 iterations: 95% vs Medium, same as 160, at twice the time).

#### Why the levels separate
Each level is the one below plus one ability, so each beats the one below for a structural reason, not by tuning luck:
- **Easy to Medium adds discipline:** the same scorer, plus deliberate passing and always the best play. Prototype, 448 games: Medium beats Easy **68.6%** (95% CI 64.2-72.8). The knob that moves this is Easy's pass-when-ahead chance (0% gives 65.2%; 30% gives 70.2%; 100% gives 81.8% but then Easy beats a random bot only 57%); the near-miss chance barely moves it (65-66% from 0% to 35%).
- **Medium to Hard adds foresight:** Hard *is* Medium, run forward. Prototype vs fair Medium, 224 games: Hard beats Medium **88.2%** at 160 iterations (CI 83.3-91.8) and 82.4% at 80 (CI 76.8-86.8).
- **Floor:** Easy beats a uniform-random legal-move bot **86.2%** (CI 82.7-89.1); Medium beats it 94.9%.
The trained bot plugs in as a fourth policy behind the same interface, and the same ladder ranks it.

### 1. Approach (BL-1)
Architect, Thu 2026-10-08, against c93b911 (origin/main with PR 22). Measurements were taken with a scratch prototype of the BL-1 code below (fair `determinize`, Easy, Hard on the fair view), not today's code, unless a line says "today".

**Applied defaults (Aiden asleep; Aiden may overturn any of them):** 1 Medium is the first-visit default. 2 The bot knows the opponent's starter or premade list, and only the house pool for a custom deck. 3 Easy = naive passing plus an occasional second-best card. 4 Hard = today's Level 2 at the largest iteration count within 1.5 s p95 (measured: 160 on a laptop core; BL-2 confirms on Railway). 5 Budget as written (1.5 s p95, 3 s cap, at most 1 s slower than Medium). 6 Labels and one-liners as written.

- **One fair harness for every bot.** `botDecide(policy, g, me, ctx)` builds the fair view with one shared `determinize`, hands *only the view* to the policy, applies the no-throw guard, and validates the answer. Medium becomes "today's `decide` on the view" with no code change in `decide`; Easy is a new 40-line policy over a `rankedPlays` refactor of `bestPlay`; Hard is today's search with its leaky `determinize` deleted and its root shortlist computed on the view.
- **A registry of versioned policies** (`easy:heur-easy-1`, `medium:heur-2`, `hard:mcts-1@160`) with a committed 50-state decision golden that fails `npm run check` when decisions change without a version bump.
- **Seeded per decision:** each decision's randomness comes from `decisionSeed(botSeed, turnNo)`, so one recorded state reproduces one decision, in a worker (BL-2) or not.
- **A ladder** (`npm run ladder`) that plays the same 448 deals per pairing, records every match as a JSON line shaped like a `match_records` row, and writes a summary with Wilson CIs and c3 pass/fail.
- **Rejected: each policy determinizes itself** (data-platform 3e as written). Fairness would depend on every policy author, the trained bot included; the harness makes it a property of the system, tested once. Also rejected: a time-budgeted Hard search (think until 1.2 s), because a clock-dependent decision breaks c4, the golden and ladder reproducibility (ADR 0004).
- **ADR:** docs/decisions/0004-bot-policy-contract.md (the policy contract, the id format that reaches `match_records.bot_version`, per-decision seeds).

**Measured numbers** (Oct 8, Apple laptop, Node 22, a scratch prototype of this design; starter decks; houses, seats and first player rotated; draws count half).
| Hard iterations | Decisions | p50 ms | p95 ms | max ms | vs fair Medium |
| --- | --- | --- | --- | --- | --- |
| 80 | 273 (20 games) | 339 | 741 | 859 | 82.4% over 224 games (CI 76.8-86.8) |
| 160 | 271 (20 games) | 657 | 1,414 | 1,786 | 88.2% over 224 games (CI 83.3-91.8) |
| 320 | 277 (20 games) | 1,285 | 2,707 | 3,803 | 95% over 20 games (CI 76-99), same as 160 on those 20 |
- The three timing runs ran as 3 processes at once; Railway's vCPU is likely slower than this core, so 160 is the laptop answer to open decision 4 and BL-2 confirms it on production (R1). 320 fails the budget (p95 2.7 s, max over the 3 s cap) with no measured gain.
- Easy (knobs as in section 3), 448 games each: Medium beats Easy 68.6% (CI 64.2-72.8); Easy beats uniform-random 86.2% (CI 82.7-89.1); Medium beats uniform-random 94.9%. Easy and Medium think 0.25-0.3 ms p50, 0.6 ms p95.
- Fair view: 0 of 11,363 Medium decisions change on starter decks (coin stream held fixed); c4 scrambling changes 0 of 200 decisions for each fair level, and 71 of 200 for today's Hard.
- Today's head-to-head (PR 22's ~90% vs Level 1) used the leaky determinize; the fair Hard measures 88.2%, so the leak was worth little on starters.

### 2. Files (BL-1 is shared/ plus two CLI scripts; no server or client change)
**shared/ (engine-dev)**
| File | Change |
| --- | --- |
| shared/levels.ts (new) | `Level`, `LEVELS`, `DEFAULT_LEVEL`, `LEVEL_INFO`, `isLevel`. No imports, so client and protocol can use it without pulling in the bots. |
| shared/rng.ts (new) | `mulberry` moved from sim.ts:6 (sim.ts re-exports it, callers unchanged), `decisionSeed`. |
| shared/determinize.ts (new) | `DeckKnowledge`, `determinize`, `revealedCards`. Replaces bot-mcts.ts:41-50. DP-1 consumes this file, not a copy. |
| shared/bot.ts | Export `Play`, `ScoredPlay`, `rankedPlays`, `lead` (bot.ts:89, now exported), `passThrowsMatch`, `legalActions`. `bestPlay` (bot.ts:69-83) becomes `rankedPlays(g, me)[0] ?? null`, same result. `decide` unchanged. |
| shared/bot-easy.ts (new) | `EasyKnobs`, `EASY_KNOBS`, `decideEasy`. |
| shared/bot-mcts.ts | Delete `determinize` (:41-50) and `decideMcts` (:121-123). `searchMcts` takes the view and `know`, re-determinizes with shared/determinize.ts, drops a match-throwing pass from the shortlist; no `Math.random` defaults. Add `MCTS_VERSION`, `HARD_ITERATIONS`. |
| shared/bots.ts (new) | `BotPolicy`, `BotContext`, `BotMove`, `botId`, `goldenKey`, `BOTS`, `RANDOM_BOT`, `hardPolicy`, `botDecide`. |
| shared/ladder.ts (new, pure) | Schedule, one match, replay check, summary, Wilson. Takes a `now()` clock as a parameter, so it stays free of Date/performance. |
| shared/simulate-bots.ts | Deleted; replaced by the ladder. |
| shared/__golden__/bot-levels.json (new, generated) | 50 decisions per `level:version`. |

**scripts/ (engine-dev)**
| File | Change |
| --- | --- |
| scripts/ladder.ts (new) | The CLI: arguments, worker_threads pool, git SHA, writes the output dir. All I/O lives here. |
| scripts/bot-golden.ts (new) | Records golden entries for ids missing from bot-levels.json; refuses to overwrite an existing id. |
| package.json | `"ladder": "tsx scripts/ladder.ts"`, `"sim:bots"` re-pointed to the same file (c3 names `sim:bots`), `"bot-golden": "tsx scripts/bot-golden.ts"`. |
| docs/balance/bot-levels/<YYYY-MM-DD>-<sha>/ (generated, committed) | `summary.json`, `summary.md`, `matches.jsonl.gz` (committed when under 5 MB; estimated 2 MB). |

**Tests (qa-engineer):** shared/determinize.test.ts, shared/bots.test.ts, shared/bot-easy.test.ts, shared/ladder.test.ts (new); shared/bot-mcts.test.ts migrated (its `determinize` tests move to determinize.test.ts; `decideMcts` calls become `botDecide(hardPolicy({ iterations }), ...)`); shared/fuzz.test.ts gains the two fuzzer checks in section 6. bot.test.ts and its snapshot are untouched and must stay green.

**server/, client/:** none in BL-1. server/app.ts:354 keeps calling today's `decide(cur, p)` (leaky, negligible on starters) until BL-2 switches it to `botDecide`.

### 3. Interfaces
```ts
// shared/levels.ts
export type Level = 'easy' | 'medium' | 'hard';
export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'];
export const DEFAULT_LEVEL: Level = 'medium';                       // open decision 1, applied default
export const LEVEL_INFO: Readonly<Record<Level, { label: string; blurb: string }>> = {
  easy:   { label: 'Easy',   blurb: 'Learning the game' },
  medium: { label: 'Medium', blurb: 'Plays solid moves' },
  hard:   { label: 'Hard',   blurb: 'Plans ahead and passes well' },
};
export function isLevel(x: unknown): x is Level;

// shared/rng.ts
export function mulberry(seed: number): () => number;               // moved verbatim from sim.ts:6
/** uint32 seed for one decision: fmix32(botSeed ^ Math.imul(turnNo + 1, 0x9e3779b1)). */
export function decisionSeed(botSeed: number, turnNo: number): number;

// shared/determinize.ts
/** What is public about the opponent's deck: its list for a starter or premade, null for a custom deck. */
export interface DeckKnowledge { readonly oppList: readonly string[] | null }
/** Card ids of `owner`'s cards that have been revealed: its discard plus every non-token unit it owns on either board. Sorted. */
export function revealedCards(g: Readonly<GameState>, owner: PIdx): string[];
/** A copy of g that holds only what `me` may know; never mutates g. Output depends only on the public part of g, `know` and the rnd stream. */
export function determinize(g: Readonly<GameState>, me: PIdx, rnd: () => number, know: DeckKnowledge): GameState;
```
`determinize`, exactly:
1. `s = clone(g)` (engine.ts:725).
2. **Own deck:** sort by `cardId`, then `uid` (string compare), then Fisher-Yates with `rnd`.
3. **Opponent's hidden cards:** `H` = hand size, `n` = hand + deck size, `uids` = their uids sorted (string compare).
4. **Their card ids:**
   - if `know.oppList` is set: `oppList` minus `revealedCards(g, opp)` as multisets. If every revealed id was found and exactly `n` remain, use them.
   - otherwise (custom deck, or a list that doesn't fit, which means the caller's knowledge was wrong): `n` picks, each uniform over the ids of `deckPool(house)` (cards.ts:428) still allowed by `DECK_RULES` (cards.ts:420) counting revealed and already-picked cards. The candidate set is recomputed per pick, so there is no rejection loop. The reconstructed 25 cards are then a legal deck (tested).
5. Sort the ids, Fisher-Yates them with `rnd`, pair them with `uids` in order; hand = the first `H`, deck = the rest.
6. `s.rng = Math.floor(rnd() * 2 ** 32) >>> 0`.
7. Nothing else changes: boards, discards, wins, passed, round, results, `nextId`, both names.
Steps 2-5 consume `rnd` a number of times that depends only on public counts, which is why a fixed `rnd` gives an identical view for every consistent arrangement. The opponent's discard is kept: every card in it was revealed by a `play` or `destroy` event, except a card burned by a full hand (engine.ts:132), the leak data-platform R9 already accepts.

```ts
// shared/bot.ts (additions; decide, evaluate, candidatePlays, bestTakingPlay, takeRoundCost unchanged)
export type Play = Extract<Action, { type: 'play' }>;
export interface ScoredPlay { v: number; play: Play }
/** Every candidate play with bestPlay's score, best first; equal scores keep candidatePlays order (stable sort), so [0] is bestPlay's pick. */
export function rankedPlays(g: GameState, me: PIdx): ScoredPlay[];
export function bestPlay(g: GameState, me: PIdx): ScoredPlay | null;          // = rankedPlays(g, me)[0] ?? null
export function lead(g: GameState, me: PIdx): number;                          // was private (bot.ts:89)
/** [pass, ...candidatePlays that validate]: the uniform-random bot's choice set. */
export function legalActions(g: GameState, me: PIdx): Action[];
/** True when passing now ends the match with `me` losing (applyAction on a clone) and `me` has a legal play. Public information only. */
export function passThrowsMatch(g: GameState, me: PIdx): boolean;

// shared/bot-easy.ts
export interface EasyKnobs {
  aheadPassP: number;     // chance to pass on a turn it is ahead while the opponent is still playing
  mistakeP: number;       // chance to consider a near-miss instead of the best play
  mistakeDepth: number;   // near-misses are the 2nd..(1+mistakeDepth)th best distinct cards
  slack: number;          // ...and only if they score within `slack` of the best
}
export const EASY_KNOBS: EasyKnobs = { aheadPassP: 0.25, mistakeP: 0.2, mistakeDepth: 2, slack: 4 };
export function decideEasy(view: GameState, me: PIdx, rnd: () => number, k: EasyKnobs = EASY_KNOBS): Action;
```
`decideEasy`, exactly:
1. Empty hand, or `rankedPlays` empty: pass.
2. `diff = lead(view, me)`.
3. If the opponent has passed: pass when `diff > 0`, else play `ranked[0]` (no near-miss when the round can be taken).
4. If `diff > 0` and `rnd() < aheadPassP`: pass.
5. If `rnd() < mistakeP`: keep only each card's first (best) entry in `ranked` (by `cardId`, so two rows of the same card are not a mistake); among entries 2..1+`mistakeDepth` of that list with `v >= ranked[0].v - slack`, play one chosen uniformly by `rnd`, if any. (The prototype ranked plays, not cards; the knob barely moved the result either way, so the ladder re-measures.)
6. Play `ranked[0]`.

```ts
// shared/bot-mcts.ts (changed)
export const MCTS_VERSION = 'mcts-1';
export const HARD_ITERATIONS = 160;                // applied default 4; the largest of 80/160/320 within 1.5 s p95 on a laptop core; BL-2 re-measures on Railway
export const MCTS_DEFAULTS: MctsOptions = { iterations: HARD_ITERATIONS, topK: 6, c: 0.7 };
/** As today, on the view; omits pass when passThrowsMatch(view, me). */
export function rootMoves(view: GameState, me: PIdx, topK: number, rnd: () => number): Action[];
/** As today (bot-mcts.ts:88-119), except: called with the fair view, each iteration runs determinize(view, me, rnd, know), no Math.random default. */
export function searchMcts(view: GameState, me: PIdx, rnd: () => number, know: DeckKnowledge, opts?: Partial<MctsOptions>): { action: Action; stats: MctsStats[] };

// shared/bots.ts
export interface BotContext {
  readonly rnd: () => number;            // the only randomness a policy may use; built by the caller from decisionSeed(botSeed, g.turnNo)
  readonly know: DeckKnowledge;
}
export interface BotPolicy {
  readonly level: string;                // a Level in BOTS; anything else for baselines, fakes and the trained bot ('random', 'test', 'trained')
  readonly version: string;              // bump whenever its golden decisions change
  readonly params?: string;              // strength config that is not the algorithm, e.g. '160' iterations
  /** `view` is already fair (determinize) and is the policy's own copy; it may mutate it. */
  decide(view: GameState, me: PIdx, ctx: BotContext): Action;
}
export interface BotMove { action: Action; guarded: boolean }   // guarded: the no-throw guard replaced a pass
export function botId(p: BotPolicy): string;           // `${level}:${version}` + (params ? `@${params}` : ''), e.g. 'hard:mcts-1@160'
export function goldenKey(p: BotPolicy): string;       // `${level}:${version}`
export function hardPolicy(opts?: Partial<MctsOptions>): BotPolicy;   // level 'hard', version MCTS_VERSION, params String(iterations)
export const BOTS: Readonly<Record<Level, BotPolicy>>;
//   easy:   { level: 'easy',   version: 'heur-easy-1', decide: (v, me, c) => decideEasy(v, me, c.rnd) }
//   medium: { level: 'medium', version: 'heur-2',      decide: (v, me, c) => decide(v, me, c.rnd) }   // 'heur-1' = today's leaky bot
//   hard:   hardPolicy()                                  // decide: (v, me, c) => searchMcts(v, me, c.rnd, c.know).action
export const RANDOM_BOT: BotPolicy;                     // 'random:uniform-1': uniform over legalActions; ladder baseline only
/** The only way a bot move is made. Throws if g is over, it is not me's turn, or the policy's action fails validate() on g. */
export function botDecide(p: BotPolicy, g: Readonly<GameState>, me: PIdx, ctx: BotContext): BotMove;
```
`botDecide`: `view = determinize(g, me, ctx.rnd, ctx.know)`; `a = p.decide(view, me, ctx)`; if `a` is a pass and `passThrowsMatch(view, me)`, replace it with `bestPlay(view, me).play` and set `guarded`; if `validate(g, me, a)` (engine.ts:341) is not null, throw with `botId(p)` in the message. Actions name only the bot's own hand and board uids, which the view leaves unchanged, so they apply to the real g.

**Version rule.** A level's version changes when any of its 50 golden decisions changes. Easy and Hard are built on bot.ts, so a bot.ts behaviour change bumps all three. G3 and E3 (spec, Out of scope) will bump Medium (and so Easy and Hard).

**Ladder (shared/ladder.ts, pure; scripts/ladder.ts, the CLI).**
```ts
export type LadderBot = Level | 'random';
export const DEFAULT_PAIRINGS: readonly (readonly [LadderBot, LadderBot])[] = [
  ['medium', 'easy'], ['hard', 'medium'], ['hard', 'easy'], ['easy', 'random'], ['medium', 'random'], ['hard', 'random'],
];
export interface LadderOptions { gamesPerPairing: number; baseSeed: number; pairings?: typeof DEFAULT_PAIRINGS }
export interface LadderJob {
  pairing: string; i: number;                      // 'hard-medium', 0..games-1
  a: LadderBot; b: LadderBot; aSeat: PIdx; first: PIdx;
  houses: [House, House];                          // by seat
  seed: number; botSeeds: [number, number];        // by seat
}
/** 16 ordered house pairs (mirrors included) x a's seat x first player = 64 cells; ceil(games / 64) seeds per cell
 *  (400 -> 448 games). seed = baseSeed + cellIndex * reps + rep, identical across pairings, so every pairing plays the same deals. */
export function schedule(o: LadderOptions): LadderJob[];
export function playLadderMatch(job: LadderJob, bots: Readonly<Record<LadderBot, BotPolicy>>, meta: { buildSha: string }, now: () => number): LadderRecord;
/** createGame(seed, first, decks, names 'Player 1'/'Player 2') + applyAction over steps; true if rounds and winner match. */
export function replayRecord(r: LadderRecord): boolean;
export function summarize(rs: readonly LadderRecord[], meta: SummaryMeta): LadderSummary;
/** Wilson score interval; draws count half in `score`. */
export function wilson(score: number, n: number, z?: number): [number, number];
```
`playLadderMatch` passes both decks explicitly (`deckList(house)`, the dealt order), and for each decision `ctx = { rnd: mulberry(decisionSeed(botSeeds[p], g.turnNo)), know: { oppList: deckList(houses[other]) } }`. A throw or an illegal action ends the record with `endReason: 'error'`, `outcome: 'void'` and the message; 400 actions without a finish is the same (sim.ts:45's guard).

**The record: one JSON line per match**, a superset of data-platform's `match_records` row (2b, 3c) in its camelCase `MatchRecord` form, so DP's queries and `replay()`/`matchFacts()` run on it unchanged:
```ts
export interface LadderSeat {          // SeatRec (data-platform 3c) + botSeed
  house: House; deck: string[];        // dealt order
  source: string;                      // 'premade:starter-<house>' (+ '@<listHash>' once DP-1's version.ts exists)
  bot: string;                         // botId, e.g. 'hard:mcts-1@160'
  device: 'bot';
  botSeed: number;
}
export interface LadderStep { s: PIdx; a: Action; w: number; ms: number; guard?: true }   // LoggedStep + ms: this decision's think time
export interface LadderRecord {
  v: 1; id: string; mode: 'ladder';                         // id: 'hard-medium/0137'; match_records.mode is text, 'ladder' is additive
  startedAt: null; endedAt: null;                            // sims have no wall time
  buildSha: string; engineVersion: number | null; rulesHash: string | null;   // null until shared/version.ts (DP-1)
  endReason: 'normal' | 'error'; outcome: 'p0' | 'p1' | 'draw' | 'void';
  player0: null; player1: null; botSeat: null; botVersion: null;               // both seats are bots: see seats[i].bot
  seed: number; firstSeat: PIdx;
  seats: [LadderSeat, LadderSeat];
  steps: LadderStep[];
  rounds: RoundResult[];                                     // engine.ts:40
  replayOk: boolean;
  facts: null;                                               // DP-1's matchFacts() can fill it later from the inputs
  pairing: string; i: number; error?: string;                // ladder-only
}
```
Size: data-platform measured 2.2 KB per match of inputs (0.5 KB gzipped); with `ms` and the extra keys, about 2.6 KB raw and 0.7 KB gzipped, so 2,688 matches are about 7 MB raw and about 2 MB as `matches.jsonl.gz`. The CLI sorts lines by (pairing, i), so two runs differ only in `w` and `ms`.

**The summary** (`summary.json`; `summary.md` renders the same as tables):
```ts
export interface Score { games: number; score: number }          // score: a's share, draws half
export interface PairStats {
  pairing: string; a: string; b: string;                          // bot ids
  games: number; errors: number; guards: number;
  aWins: number; bWins: number; draws: number; aScore: number; ci95: [number, number];
  byHouse: Record<string, Score>;                                 // 'EMBER>COVEN' = a's house > b's house
  byFirst: { aFirst: Score; bFirst: Score };
  bySeat: { aSeat0: Score; aSeat1: Score };
  rounds: { twoZero: number; twoOne: number; withTie: number;     // shares of games
            r1WinnerWonMatch: number; aWonRound: [number, number, number] };
  passing: Record<'a' | 'b', { passedFirst: [number, number, number];      // share of rounds 1..3 it passed first
                               handAtPass: [number, number, number];        // mean own hand size at its pass
                               playsBeforePass: [number, number, number] }>;
  cardsLeftAtEnd: { a: number; b: number };                       // mean hand size at match end
}
export interface LadderSummary {
  v: 1; createdAt: string; buildSha: string; baseSeed: number; gamesPerPairing: number; workers: number;
  bots: Record<LadderBot, string>;
  pairs: PairStats[];
  think: Record<string, { decisions: number; p50: number; p95: number; max: number; mean: number }>;   // per bot id, ms
  criteria: { id: 'c3-hard-medium' | 'c3-medium-easy' | 'c3-easy-random'; value: number; ciLow: number; pass: boolean }[];
}
export interface SummaryMeta { createdAt: string; buildSha: string; baseSeed: number; gamesPerPairing: number; workers: number }
```
Pass and hand statistics come from replaying each record in `summarize` (0.035 ms each, data-platform 1). The c3 bars: hard-medium score >= 0.75 and ciLow >= 0.70; medium-easy score in [0.65, 0.85] and ciLow >= 0.60; easy-random score >= 0.80.

**CLI:** `npm run ladder -- [--games 400] [--seed 20261008] [--pairs hard-medium,medium-easy] [--iterations 160] [--jobs N] [--out DIR] [--assert]`.
- `--jobs` defaults to `os.availableParallelism() - 1` worker_threads; `--jobs 1` runs in-process. Output defaults to `docs/balance/bot-levels/<YYYY-MM-DD>-<short sha>/`.
- `--iterations` builds `hardPolicy({ iterations })`, so the id records it.
- `--assert` exits 1 when a c3 bar fails, any record has `endReason: 'error'`, or any `replayOk` is false. The CLI warns when `matches.jsonl.gz` is over 5 MB (then commit only the summaries).
- Estimated run: 1,344 Hard matches at about 9 s each is 3.4 CPU-hours, so 30-45 min on 9 workers of a 10-core laptop. Not in CI; run on the BL-1 PR and on every policy version bump.

**Golden (c8):** shared/__golden__/bot-levels.json is `Record<goldenKey, string[50]>`. The 50 states: seeds 70000-70049, houses rotating, Medium-vs-Medium play stopped after `(k * 7) % 22 + 3` actions, the bot to move; each line is `seed turnNo JSON(action)` from `botDecide(policy, g, g.current, { rnd: mulberry(decisionSeed(k, g.turnNo)), know: starter })`. Hard runs `hardPolicy({ iterations: 16 })` under its key `hard:mcts-1` (about 4 s). The test fails if the current key is missing ("run `npm run bot-golden`") or any line differs. Old keys stay as history.

**Persisted data.** None in BL-1 except the committed golden and ladder reports. The id strings are the future `match_records.bot_version` values (BL-2 logs them, DP-3 stores them), hence ADR 0004.

### 4. Invariants
1. **Pure and deterministic.** All new shared/ code takes `rnd` (and the ladder library takes `now`); no `Math.random`, `Date` or `performance` in shared/. `decisionSeed` makes each decision a function of (state, botSeed, knowledge, policy id). The CLI in scripts/ owns the clock, fs and workers. The existing `decide` default `rnd = Math.random` (bot.ts:132) stays only for server/app.ts:354 until BL-2.
2. **Server authoritative.** No server change. BL-2's worker answers still go through `applyAction` validation (app.ts:367-370), and `botDecide` validates first.
3. **No rule numbers in the client.** BL-3 reads `LEVELS`, `LEVEL_INFO` and `DEFAULT_LEVEL` from shared/levels.ts.
4. **No animation timings on the server.** Think time is CPU time, not animation; nothing here touches `animTime`.
5. **Card text.** No card changes.
6. **Hidden information.** Strengthened: policies never receive the real state. The ladder's records carry seeds and deck orders, but only of simulated matches.

### 5. Risks
| # | Risk | Mitigation / test |
| --- | --- | --- |
| R1 | Hard at 160 misses 1.5 s p95 on Railway's vCPU (laptop p95 1.41 s, 3 processes in parallel). | Think time is linear in iterations (p50 about 4.1 ms per iteration, p95 about 8.8). BL-2 reads `think` from `match_end` (c8) and sets `HARD_ITERATIONS` to the largest that fits; the id changes (`@N`), the golden key does not. 80 iterations measured below as the fallback strength. |
| R2 | The `rankedPlays` refactor changes Medium. | bot.test.ts's DM-1 c3 snapshot (never regenerated) plus a test that `rankedPlays[0]` equals the old `bestPlay` on fuzz states. |
| R3 | Medium vs Easy drifts out of 65-85% as cards change. | The ladder reports it with a CI on every version bump; `aheadPassP` is the one effective knob (measured above); game-designer owns the band. |
| R4 | Fair determinization weakens Hard below c3. | Measured ("Measured numbers" below): 88.2% (CI 83.3-91.8) at 160 and 82.4% (CI 76.8-86.8) at 80, both clear c3's 75%/70% bars. The ladder is the gate. |
| R5 | A hand-overflow burn (engine.ts:132) stays visible in the view. | Accepted, as data-platform R9. Rare: needs 9+ cards in hand at a draw. |
| R6 | worker_threads under tsx fail on some machine. | `--jobs 1` runs in-process; the ladder test covers the library, not the pool. |
| R7 | Strategy fusion / Medium-played futures let humans exploit Hard. | Accepted (spec Out of scope); human win rate per level is the trigger. |
| R8 | c4/c5 tests slow `npm run check`. | Hard runs at 4 iterations for c4 (prototype: 400 Hard decisions in 5.4 s) and 2 for c5; each in its own file so vitest runs them in parallel. |
| R9 | Custom decks (CV-4) make the house-pool path matter and it is untested in play. | determinize.test.ts checks every pool sample reconstructs a legal deck; CV-4 reruns the ladder with random legal decks (a flag it adds). |

### 6. Test plan (qa-engineer writes all of it)
**vitest, shared**
- **determinize.test.ts.** Public parts unchanged (own hand, boards, discards, wins, passed, results, counts); own deck is the same multiset; with a known list, the opponent's hand + deck multiset equals list minus revealed; with `oppList: null`, revealed + sampled is a legal deck (`validateDeck(house, ids) === null`) on 2,000 random-deck states; the input is never mutated. **Core property:** `determinize(scramble(g), me, mulberry(k), know)` deep-equals `determinize(g, me, mulberry(k), know)`, where `scramble` redeals the opponent's hand and deck instances (same counts), reorders the bot's deck and changes `g.rng`. Fails today: bot-mcts.ts:41-50 keeps the real multiset but its output follows the real arrangement.
- **bots.test.ts.**
  - c4: on 200 seeded mid-match states, for all three levels, `botDecide(..., scramble(g), ...)` returns the same action as on `g` (Hard at 4 iterations), plus 50 random-deck states with `oppList: null`. Fails without the change: today's Hard differs on 71 of 200 (prototype).
  - c5: 1,000 states from Medium-vs-Medium sims where the opponent has passed, `lead < 0`, losing the round loses the match, and `bestTakingPlay` (bot.ts:96) is not null: no level passes (Hard at 2 iterations). A fake always-pass policy in the same states comes back `guarded: true` with a play.
  - c8 golden: every `BOTS` level's `goldenKey` exists in bot-levels.json and its 50 lines match.
  - `botId` formats, `isLevel`, `BOTS` versions, `botDecide` throws on a fake policy returning an illegal action, and its result validates on the real state.
- **bot-easy.test.ts.** Opponent passed and Easy behind with a play: plays `ranked[0]`; opponent passed and Easy ahead: passes; with `aheadPassP = 0, mistakeP = 0` it equals `ranked[0]`; a near-miss is always within `slack`, a different card from the best, and among the 1 + `mistakeDepth` best distinct cards.
- **bot-mcts.test.ts (migrated).** Existing assertions on the new signatures; shortlist omits pass when `passThrowsMatch`; stats sum to the iteration count.
- **ladder.test.ts.** `schedule(400)`: 448 jobs per pairing, every (house pair, seat, first) cell 7 times, the same seeds in every pairing; `playLadderMatch` twice with `now = () => 0` gives identical records; `replayRecord` is true on them; `summarize` on hand-made records gives known numbers (`wilson(0.5, 100)` is about [0.404, 0.596]); a 4-match smoke with Hard at 2 iterations finishes without errors.
- **bot.test.ts** unchanged and green.

**Fuzzer** (sim.ts `runFuzz`, fuzz-lite in every check): on the random-deck matches, every 5th state also checks (a) the `oppList: null` determinize reconstructs a legal deck and (b) `botDecide(BOTS.easy | BOTS.medium, ...)` returns an action that `validate` accepts.

**Ladder** (c3): `npm run ladder -- --assert` on the BL-1 PR; the report under docs/balance/bot-levels/ is attached.

**Playwright:** nothing new in BL-1 (no client or server change); `npm run e2e` stays green. BL-2/BL-3 own the picker e2e.

### 7. Work split
| Phase | Task | Owner | Files |
| --- | --- | --- | --- |
| A | T1 fair view and contract | engine-dev | shared/levels.ts, shared/rng.ts, shared/sim.ts (re-export only), shared/determinize.ts, shared/bots.ts (with `medium` and `RANDOM_BOT`; `easy`/`hard` entries in phase C) |
| A | Q1 tests for T1 and the contract | qa-engineer | determinize.test.ts, bots.test.ts (c4, c5, golden), fuzz.test.ts |
| B (parallel) | T2 Easy | engine-dev | shared/bot.ts, shared/bot-easy.ts |
| B (parallel) | T3 Hard | engine-dev | shared/bot-mcts.ts |
| B (parallel) | T4 Ladder | engine-dev | shared/ladder.ts, scripts/ladder.ts, package.json, delete shared/simulate-bots.ts |
| B (parallel) | Q2 tests | qa-engineer | bot-easy.test.ts, bot-mcts.test.ts, ladder.test.ts |
| C | T5 register and record | engine-dev | shared/bots.ts (`easy`, `hard`), scripts/bot-golden.ts, shared/__golden__/bot-levels.json |
| D | Ladder run | orchestrator | `npm run ladder -- --assert`; commit docs/balance/bot-levels/<dir>/ |
T3 needs only `determinize`'s signature and `passThrowsMatch` (T2's bot.ts) at compile time: T3 imports `passThrowsMatch` from bot.ts, so T2 lands that one function first or T3 rebases onto T2. No two tasks in a phase share a file.

### What BL-2 and BL-3 need from BL-1 (contract only)
- **BL-2 (server):** call `botDecide(BOTS[level], g, botSeat, { rnd: mulberry(decisionSeed(r.botSeed, g.turnNo)), know: { oppList: deckList(humanHouse) } })` inside the worker; every argument is structured-clonable except the policy, so the worker looks the policy up by `level` in its own `BOTS` import. `r.botSeed` is per match from the server's randomness; recording it with the match makes every bot decision reproducible. The fallback is `botDecide(BOTS.medium, ...)` on the main thread (prototype p95 0.6 ms). Log `bot: botId(policy)` on `match_start`/`match_end`. Start the worker at the turn and apply at `max(botDelayMs, answer)` (app.ts:138 already waits `animTime + 500-1200 ms`), so Hard's think time mostly hides inside the existing pause (c6). A missing level from an old client maps to `'medium'` explicitly, not to `DEFAULT_LEVEL`, so a later picker default can't change old clients. A fake policy for c7/c8 is any `BotPolicy`; how it reaches the worker (in-thread in tests, or by module path) is BL-2's call.
- **BL-3 (client):** `LEVELS`, `LEVEL_INFO`, `DEFAULT_LEVEL` from shared/levels.ts; nothing else.

### Flags for the orchestrator (not absorbed)
1. **data-platform 3e is superseded on three points:** `decide` stays the raw heuristic (rollouts and `npm run sim` call it thousands of times; the harness is the fair entry point); `determinize` lives in shared/determinize.ts, not bot.ts; the opponent's discard is kept rather than refilled. Its B2 property becomes this spec's c4 test (one test, not two). DP-1's brief needs that edit before it starts; DP-1's `HEURISTIC_VERSION` becomes `botId(BOTS.medium)`.
2. **Criterion 3 names `npm run sim:bots`;** the design keeps that name as an alias of `npm run ladder`.
3. **Criterion 8's example id is `hard:mcts-1`;** the logged id is `hard:mcts-1@160` (the iteration count is part of what was played), and the golden key is `hard:mcts-1`. product-strategist may want c8's wording aligned.
4. **The "Known blind spot" paragraph of the spec overstates strategy fusion** for this implementation (see "Strategy fusion, and Hard's real limit"); the real ceiling is that Hard's futures are played by Medium. Worth one sentence in the spec if product-strategist agrees.
