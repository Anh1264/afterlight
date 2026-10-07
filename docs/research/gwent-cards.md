# Research: Gwent mechanics for a bigger AFTERLIGHT card pool

Status: research input, not a spec. Date: 2026-10-07. Goal: grow from 108 cards and 4 starter decks to a much larger pool with two decks per house, about 80% proven Gwent mechanics and archetypes and about 20% original. Gwent facts are cited in the Sources section at the end. Statements about our engine come from `shared/cards.ts` and `shared/engine.ts` at commit 7e39dd2. Recommendations are marked as recommendations.

**Where we start.** Each house has 24 cards and Neutral has 12. Keywords: Deploy, Resolve, Last Words, Guard, Shield, Poison, Grow, Burn, Rally, Echo, Sacrifice, Duel, Silence, Boost, Take control, Draw, Destroy. Effects are `name:arg` strings dispatched in `targetSpecFor`, `applyEffect` and `lastWords`. A unit has `power` and `base` and boolean statuses (grow, guard, shield, poison, silenced, token). There is a discard pile, but no trigger fires when another card is played, no activated abilities, no mulligan, no leader, no row statuses and no carryover between rounds. Backlog E1, the typed effect registry, should land before a large card drop: every mechanic below is cheaper once each effect is defined in one place.

---

## 1. Core design levers

Gwent is an auction. Each round you spend cards to buy a win, and cards don't come back, so every card is judged on *points per card* and on *when* those points land. Five levers set that value.

| Lever | What it is | Gwent shape | AFTERLIGHT today |
| --- | --- | --- | --- |
| **Point-slam** | A card's value lands at once, as raw power or Deploy boosts. | Bronze filler costs 4 provisions; high-provision golds are big immediate swings. | Vanilla 6s (Lancer, Pyre Hound, Sellsword, Patchwork), Magma Titan 11, Fallen Colossus 12. |
| **Engine** | Points that accrue over turns while the unit survives (end-of-turn boosts, triggers on later plays). Engines are greedy: they need a long round and must survive removal. | Thrive, Harmony, Vitality, Order units, Greatswords, Machines. | Grow (Thornling, Mawroot). Poison works as an engine *against* the enemy. Rally is a one-shot. |
| **Removal: tall punish** | Kills or shrinks one big unit. It answers engines and slams. | Damage X, "destroy the highest" (Scorch), Lock (switches engines off). | Burn X, Azhar (Destroy ≤6), Bounty Hunter, Vorok, Duel, Silence. |
| **Removal: wide punish** | Hits many units, usually one row. It answers token floods and boards of small engines. | Row hazards and weather, "damage every unit in a row", sweep low units. | Hellfire (row), Flame Warden, Hue, Static Burst, Grandmother Rot, Fallen Colossus. |
| **Card advantage** | Ending the match with more meaningful plays than the opponent. | Spies (classic), draw, dry passes, tutors, and thinning (pulling copies from the deck) to improve later draws. | Draw cards (Bog Oracle, Lantern Keeper), Brand Priest. No thinning, no spies. |
| **Round control** | Choosing *which* round you win and who plays last ("last say"). | Going-second advantage plus coin-flip compensation; carryover (Resilience); tempo; leader charges. | First Light (+2 to the first player in R1), winner starts next round, **Resolve** (our signature last-say lever). |

**How a healthy pool balances them (recommendation, drawn from Gwent's history):**

1. **A rock-paper-scissors triangle.** Engines beat slam in a long round. Removal beats engines. Slam beats removal, because removal has no good target and slam is efficient. Every house needs at least one card from each corner, and its *identity* comes from which corner it leans on.
2. **Every house can answer both tall and wide, but not equally well.** Gwent's design writing stresses faction identity over handing every faction the same tools. Rule of thumb: each house deck can reach 2+ tall answers and 1+ wide answer, and Neutral supplies a fallback for each (today Neutral has Bounty Hunter for tall and nothing for wide).
3. **Removal must not be both cheap and unconditional**, or engines die out. Gwent repeatedly nerfed binary "destroy" cards. Keep hard destroy at Legend tier with a power cap (Azhar ≤6 is the right shape).
4. **Engines must be answerable.** Community criticism focused on engines that removal couldn't stop (resurrecting or protected engines). Any engine that also has Shield, Guard or recursion should start small.
5. **Card advantage is the strongest resource.** Draw and spies should cost tempo (low power: Bog Oracle is 2) and be capped per deck. That is what the Rare tier and the copy limits are for.
6. **Composition target per 24-card house set (recommendation):** about 35% slam or filler, 20% engines, 20% removal (60:40 tall:wide), 10% card advantage, 15% round control (Resolve, carryover, conditionals). Today Coven and Ember are close to this. Echo has almost no engine and Order almost no wide punish.
7. **Healthy-meta warning signs to watch in `npm run sim`:** one deck above 55% win rate, a round 1 decided by whoever plays first, R3 hands routinely empty or full, and decks that never interact (two engine decks racing). Gwent's balance team favoured non-destructive nerfs and buffs shipped as a whole archetype package. Copy both habits.

---

## 2. Factions and archetypes

### Gwent factions (identity, then 2-3 archetypes)

| Faction | Identity | Archetypes |
| --- | --- | --- |
| **Northern Realms** | Boosts, armour or shields, Orders with Charges, a disciplined army. | *Shieldwall/Armour engines* (protect units, convert boosts over long rounds); *Machines* (Order units that ping repeatedly); *Charge/Inspired mass-boost* (Zeal, Formation rows). |
| **Nilfgaard** | Deception: spies, Lock, Poison, reveal, tutors, copying the enemy. | *Assimilate* (create and copy cards, payoffs for playing cards not in the starting deck); *Poison/Lock control*; *Soldiers/tutor* (thin the deck, consistent golds). |
| **Monsters** | Big bodies, devouring, death value, carryover. | *Consume* (eat allies for power, recurring Consume engines); *Deathwish* (units that pay off when they die); *Thrive* (grows when stronger allies land); *Frost/Wild Hunt* (row hazards plus movement). |
| **Scoia'tael** | Mobility, many small pings, traps, nature. | *Harmony* (unique unit types each add +1); *Movement/Ambush traps*; *Nature/Symbiosis* (Vitality engines, tree tokens). |
| **Skellige** | Self-damage for power, the graveyard as a second hand. | *Bloodthirst/Berserk warriors* (damaged units transform or power up); *Discard/Cursed graveyard* (resurrect, discard to fuel); *Greatswords/Longships* (damage-scaling engines). |
| **Syndicate** | An economy: coins (Profit, Fee, Tribute, Hoard), crime, bounties. | *Crime/Intimidate tempo*; *Hoard* (bank coins for a big payoff); *Firesworn tokens* (go wide, then cash in the swarm). |

### AFTERLIGHT houses: fit today and a second archetype

| House | Current deck ("A") | Closest Gwent archetypes | Suggested second deck ("B") |
| --- | --- | --- | --- |
| **COVEN** (Poison & Grow) | Poison control plus Grow engine. Wins long rounds. | Nilfgaard Poison, Scoia'tael Nature/Vitality, Monsters Thrive. | **Devour**: Monsters' Consume plus Thrive. Big maws eat your own Sporelings and Seed Keepers (Last Words value) and feed on Poisoned enemies. Seeds already exist: Mawroot "the potted maw", Hollow Bloom "the greedy flower", Ash-Cultist-style eating. It plays tall where A plays slow. |
| **ORDER** (Shield, Guard & Rally) | A tall, protected Front row. | NR Shieldwall, classic Morale Boost (Rally) and Commander's Horn. | **Levy**: NR/Monsters muster. Bond commons that pull their own copies out of the deck (Summon), plus Formation bonuses for Front or Back. A wide, deck-thinning army, so Order isn't only "tall". Stretch goal: an Order/Charge "Command" deck once activated abilities exist (see §3). |
| **EMBER** (Burn & Sacrifice) | Tall-punish burn plus sacrifice into big bodies. Wins short rounds. | Skellige self-damage, Scoia'tael pings, Monsters Consume (Skarr). | **Fury**: Skellige Berserk/Bloodthirst. Units that power up or transform when damaged, fed by Ember's existing self-harm cards (Brimstone Ogre, Lava Golem, Magma Titan) and Adrenaline payoffs. Alternative: *Rekindle* (graveyard resurrect around Phoenix Whelp). |
| **ECHO** (Echo & Disrupt) | Token flood plus steal and shove. | Syndicate Firesworn tokens, Nilfgaard disloyal/seize, Scoia'tael movement. | **Mimic**: Nilfgaard Assimilate plus Spying. Copy enemy cards, create cards outside the starting deck (Replicator, Mirrorjack and Afterimage are seeds), and play spies on the enemy side for card advantage. |
| **NEUTRAL** | Generic slam, draw, one tall answer. | Classic neutral Scorch, Horn and weather. | Add one wide punish, one "destroy every strongest unit" card, and a mulligan or thinning helper. Hold the coin economy (Syndicate) for a possible fifth house; it is too large a system to bolt onto an existing one. |

**The original 20% (recommendation).** Keep and lean into what's already ours: **Resolve** (a keyworded last-say), **Echo across rows**, **Guard** (row protection, not Gwent's Defender), and the **First Light** framing. Three new original ideas we did not find as Gwent keywords:
- **Vigil**: triggers when *you* pass. It mirrors Resolve and rewards passing with a lead.
- **Last Light**: a bonus only in Round 3. It ties into the light theme and makes round planning matter.
- **Afterglow X**: when the round clears, leave an X-power token for next round. A small, capped carryover.

---

## 3. Mechanics table

Fit: **as-is** = a new `name:arg` effect inside the existing Deploy, Resolve or Last Words hooks. **new effect+** = also needs a new unit field, condition or status. **new system** = a new trigger hook, action type, protocol or state (sized L under CLAUDE.md). ★ = top 10 to adopt.

| Gwent mechanic | What it does in Gwent | AFTERLIGHT equivalent | Fit |
| --- | --- | --- | --- |
| Deploy | Triggers when played. | **Deploy** (same) | have |
| Order | Ability you activate manually, usable from the next turn. | none | new system (an `activate` action, protocol, bot) |
| Charge | Number of uses of an Order. | none | new system (with Order) |
| Zeal | Order usable the turn the unit is played. | none | new system (with Order) |
| ★ Bond | Triggers again for each copy of this unit you already have in play (classic "Tight Bond" doubled power). | none | as-is: `bond:n` counts same-id allies. Copy limit of 3 for Commons suits it. |
| ★ Thrive | +1 whenever you play an ally with higher power. | Grow (an unconditional engine) | new system: an "on ally played" hook. The same hook later serves Harmony and Assimilate. |
| Harmony | +1 when you play a unit of a new type/category. | none | new system plus card tags. Skip for now. |
| Deathwish | Triggers when the unit goes to the graveyard. | **Last Words** | have |
| ★ Consume | Destroy a unit (or banish from graveyard) and gain its power. | **Sacrifice** (Ash Cultist ≈ Consume +2, Skarr) | as-is: generalise `cultist` to `consume:cond`. Graveyard Consume needs Banish. |
| Lock | Disables a unit's abilities. | **Silence** (also strips statuses and blocks Last Words) | have |
| ★ Spying | Unit played on (or moved to) the enemy side, usually for a reward. Classic Spy: draw 2. | **Take control** moves sides the other way | new effect+: play onto the enemy row plus Draw. Needs a client drop target and bot scoring. |
| Veil | Unit cannot gain statuses. | none (closest: classic Hero immunity) | new effect+ (a `veil` boolean). Good counter to Poison and Silence; second wave. |
| Shield | Blocks the next damage once. | **Shield** (same) | have |
| Vitality | Status: +1 at your turn end for X turns. | **Grow** (permanent until you pass) | have (add a duration only if Grow proves too strong) |
| Bleeding | Status: -1 at its turn end for X turns. | **Poison** | have |
| Boost | Add power. | **Boost** | have |
| Strengthen | Raise base power (survives Reset). | none, though `base` exists | as-is. Matters only once Reset, Resilience or Purify exist. |
| Banish | Remove from the game; no graveyard. | none | as-is (skip the discard push). Matters only once Resurrect exists. |
| Spawn | Create a new card and play it. | **Echo** tokens, Afterimage | have (tokens). Spawning *real* cards needs a "created" flag. |
| ★ Summon / Muster | Play copies of a card straight from your deck (thins the deck). | none | as-is: `summon:id` pulls from the server-held deck. Hidden info stays server-side (invariant 6). |
| ★ Resilience | Unit stays on the board into the next round. | none | new effect+: a `resilient` flag honoured in `endRound`. A big round-control lever, so keep it Rare or above. |
| Assimilate | +1 whenever you play a card not from your starting deck. | none | new system (the on-play hook plus a `created` flag). Use for Echo B. |
| Adrenaline X | Bonus if you hold X or fewer cards in hand. | Resolve (a different condition) | as-is: a condition on Deploy. Good for R3 tension; first alternate if a ★ slips. |
| ★ Berserk / Bloodthirst | Berserk: transforms or triggers when damaged to X or below. Bloodthirst: active if X enemies are damaged. | none (`power < base` already means "damaged") | Bloodthirst is as-is (a condition). Berserk is new system (an on-damage hook inside `lose`). Ember B. |
| ★ Formation | Row-dependent bonus (Melee: Zeal; Ranged: +1). | Rally is row-local | as-is: a Deploy effect with Front/Back branches. Text must name the row (shared/CLAUDE.md). |
| Bounty | Mark an enemy; reward when it dies. | none | new effect+ (a mark status plus a destroy hook). Second wave. |
| Coins (Profit/Fee/Tribute/Hoard), Crime | A spendable per-player resource and payoffs. | none | new system (state, protocol, UI). Only for a fifth house. |
| ★ Resurrect (classic Medic) | Play a unit from your graveyard. | none (the discard pile exists) | as-is: `revive:cond` from `discard`. Card advantage, so Rare or Legend only. |
| ★ Scorch (classic) | Destroy every highest-power unit on the board (both sides). | Bounty Hunter (Burn 3 to the strongest) | as-is: `purge`. A universal tall punish for Neutral; it hits your own ties too, which is the skill test. |
| Weather / Hazards | Row status that damages or caps a row each turn. | none (one-shot row burns only) | new system (row statuses plus director visuals). The best wide punish if Echo outgrows Static Burst. |
| Commander's Horn / Morale | Double a row / +1 to a row. | **Rally** | have |
| Duel | Two units trade hits until one dies. | **Duel** | have |
| Ambush | Face-down trap that flips on a condition. | none | new system (hidden-info board state). Skip. |
| Mulligan | Redraw some cards before or between rounds. | none | system: see §4. |
| Leader ability | One per deck, with charges; adds provisions. | none | system: see §4. |

**The 10 to adopt:** Bond, Summon/Muster, Consume, Resurrect, Scorch-type purge, Formation, Spying, Resilience, Thrive, Berserk/Bloodthirst. Seven need only new effects or flags. Two (Thrive, Berserk) share a single new trigger hook, so build that hook once in E1. Spying is the only one that touches the client drop target. Alternates: Adrenaline, Veil, Bounty.

---

## 4. Deck building and collection

**What Gwent does.** A minimum of 25 cards. A provision budget of 150 plus the leader's bonus (about 15), with card costs from 4 (filler) to 13+, replacing the older bronze/silver/gold caps. Max 2 copies of a bronze card and 1 of a gold. Faction cards plus Neutral. One leader ability with charges. Mulligans each round, more in R1. The player going first gets a compensation card (Tactical Advantage). Hand limit 10. Collection: rarities Common, Rare, Epic and Legendary, crafted with scraps (30/80/200/800) or milled back into scraps. Premium (animated) versions use meteorite powder. Kegs (packs) hold 5 cards, and the last is a pick of 1 from 3. A reward book is unlocked with keys earned from contracts, plus ore, seasonal Journeys (a battle pass) and GG gifts.

**Copy (recommendation):**
1. **Provisions when the pool passes ~200 cards.** Legend 4 / Rare 6 caps get blunt as the pool grows. A provision budget (for example 150, Commons 4-6, Rares 7-9, Legends 10-14) lets us price each card individually and fix balance without moving a card between tiers. Keep exactly 25 cards (Summon thinning already punishes bigger decks) and keep the copy limits 1/2/3.
2. **Mulligan.** Redraw up to 2 in R1 and 1 before R2 and R3. It is the cheapest fix for variance, matters even more against the bot, and needs only a small new action plus a bot heuristic.
3. **Leaders, later.** One leader per house archetype (8 total): a single-charge ability and a provision bonus. This is the activated-ability system that Order/Charge would reuse, so build it once (an L epic: spec, design, /debate).
4. **Starter per archetype.** Two balanced STARTERS per house (A and B), each sim-tuned (shared/CLAUDE.md requires a game-designer sim report).

**Simplify for a vs-bot game (recommendation):**
- **No packs, no randomness in ownership, no premium tier.** Kegs, duplicates, milling and meteorite powder solve a monetisation problem we don't have.
- **Version 1: everything unlocked.** No persistence, no protocol change, and the deck builder works on day one.
- **Version 2 (optional): a reward road.** Win or play matches to earn one currency and unlock cards at fixed prices by rarity, or unlock each house's B deck after N matches with A. That needs persistence, which is L by our sizing. Avoid dailies and other fear-of-missing-out timers.
- Keep **rarity** as the deck-building tier until provisions land. Gwent split rarity (crafting cost) from bronze/gold (copies); with no crafting we need only one axis.

---

## 5. IP boundary

- **Borrowing is fine for:** rules and mechanics. Best of three, passing, rows, provisions, and keyword *behaviours* such as Bond, Consume and Resilience. The US Copyright Office states that copyright does not protect the idea or rules of a game, only its expression (FL-108).
- **Never ship:** Gwent or Witcher card names (no "Scorch", "Commander's Horn" or "Tight Bond" as card names), characters, places, factions (Northern Realms, Nilfgaard and the rest), art or art direction, flavour text, card frames, board trade dress, voice lines, or the words "Gwent" and "Witcher" in the product or its marketing (trademarks).
- **Rename the keywords in our own voice**, as we already did with Deathwish → *Last Words* and Bleeding → *Poison*. Proposed names (placeholders for game-designer): Bond → *Kinship*, Summon → *Muster call*, Consume → *Devour*, Resurrect → *Rekindle*, Scorch-type → *Purge*, Formation → *Stance*, Spying → *Infiltrate*, Resilience → *Endure*, Thrive → *Flourish*, Berserk → *Enrage*.
- **Write every card's text from scratch from our engine** (invariant 5). Never paste or paraphrase Gwent card text. Don't recreate recognisable Gwent cards as a block: the same stat line, effect and role under a new name, card after card, is copying the *selection and arrangement*, not borrowing a mechanic.
- **Art:** placeholders until Aiden supplies art (CLAUDE.md). Art briefs must not reference Witcher characters or scenes.

---

## Sources

- Provisions and the 25-card minimum: [GWENT's Design 01: Provision](https://www.playgwent.com/en/news/41252/gwents-design-01-provision); copy limits: [Gwent Wiki: Rules](https://gwent.fandom.com/wiki/Rules), [GosuNoob deck building](https://www.gosunoob.com/gwent/deck-building-basic-guide/)
- Balancing philosophy: [GWENT's Design 02: Balancing](https://www.playgwent.com/en/news/43034/gwents-design-02-balancing)
- Archetypes: [A Beginner's Guide to Deck Archetypes](https://www.playgwent.com/en/news/20031/a-beginners-guide-to-deck-archetypes), [The Evolution of GWENT's Factions](https://masters.playgwent.com/en/news/22010/the-evolution-of-gwents-factions), [Best starter decks, every faction (2026)](https://consolepulse.com/multiplatform/the-witcher/guides/gwent-best-starter-decks-every-faction-2026)
- Keywords (Order, Charge, Zeal, Lock, Veil, Spying, Banish, Spawn, Strengthen, Assimilate, Formation): [Gwent Wiki: Glossary](https://gwent.fandom.com/wiki/Glossary), [gwent.one: Inspired Zeal](https://gwent.one/en/card/200168); Thrive, Harmony, Vitality, Bleeding: [Gwent Wiki: Thrive](https://gwent.fandom.com/wiki/Thrive); Deathwish, Consume, Resilience, Bond, Shield, Reset: [Gamepressure glossary](https://www.gamepressure.com/gwent-the-witcher-card-game/glossary/z49e5a); Formation and Flanking: [Patch Notes 10.9](https://www.playgwent.com/en/news/45274/patch-notes-10-9); Adrenaline: [Way of the Witcher launch](https://cdprojekt.com/en/media/news/gwent-expansion-way-of-the-witcher-launches), [Pocket Tactics](https://www.pockettactics.com/gwent-the-witcher-card-game/way-of-the-witcher-cards); Berserk: [Cards History: Skellige](https://gwent.fandom.com/wiki/Cards_History_-_Skellige)
- Syndicate coins (Profit, Fee, Tribute, Hoard, Bounty, Crime): [Introducing Novigrad](https://playgwent.com/en/news/28414/introducing-novigrad-the-newest-gwent-expansion), [Kotaku](https://kotaku.com/greed-is-good-in-gwents-new-novigrad-expansion-1836042013)
- Classic Witcher 3 Gwent (Muster, Tight Bond, Spy, Medic, Scorch, Horn, weather, Hero): [Witcher 3 wiki: Gwent](https://thewitcher3.wiki.fextralife.com/Gwent), [GameSkinny](https://www.gameskinny.com/tips/how-to-play-gwent-in-the-witcher-3-wild-hunt/)
- Homecoming (hand limit, mulligans, Tactical Advantage): [Engadget](https://engadget.com/2018/04/14/gwent-card-game-overhaul), [Gamepretty](https://gamepretty.com/cdpr-witcher-card-game-gwent-homecoming-revealed-returning-to-witcher-3-style/)
- Strategy terms (tall and wide punish, engine, point slam, dry pass, bleed): [Gwent Wiki: Glossary](https://gwent.fandom.com/wiki/Glossary), [LerioHub: Round 1](https://leriohub.com/how-to-play-round-1-in-gwent-defining-objectives/), [Beginner's Guide to GWENT](https://www.playgwent.com/en/news/19701/a-beginners-guide-to-gwent)
- Collection: [Gwent Wiki: Crafting](https://gwent.fandom.com/wiki/Crafting), [Economy guide: ore, scraps, keys, kegs](https://consolepulse.com/multiplatform/the-witcher/guides/gwent-economy-guide-ore-scraps-keys-kegs), [Economy changes and mill refund](https://playgwent.com/en/news/25048/)
- IP: [US Copyright Office FL-108: Games](https://www.copyright.gov/fls/fl108.pdf)
