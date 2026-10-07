# CARDS-V2 - Pool expansion and a second deck for each house

Size: L (content epic: wave 1 is M, wave 2 waits for E1)    Owner: game-designer    Status: draft
Written Wed 2026-10-07 against foundation 7e39dd2, from Aiden's direction of Oct 7 ("more cards, different cards ... take 80% [of Gwent] and make up 20%"). Inputs: docs/research/gwent-cards.md, docs/specs/collection-v1.md (CV-2 ships the wave-1 decklists below).

## Read this first
- **68 new cards: 15 per house and 8 Neutral.** 41 are wave 1, built only from effects the engine already has, plus one parameter variant (`cultist:M:K`). 27 are wave 2. They need 13 new effects and 9 new keywords, and they wait for E1.
- **Each house's second deck plays from wave 1 alone.** Wave 2 only swaps cards in.
- **The 8 premades were prototyped before this spec.** Wave 1 was run in a scratch copy of shared/ with the bot-vs-bot matrix. **This measures one greedy bot policy, not players.**
  - The first draft of the B decks was badly off: Echo B won 68.4% ±1.9 and Order B 63.0% ±1.9, while Ember B won 31.6% ±1.9 (n=2400 each).
  - The tuned lists below land at 48-54% each, but **3 single pairings still fail the 40-60 band.** See Balance plan.
- **Biggest finding: an existing card, not a new one.** Afterimage (Common, 3 copies) drives the copy deck. Echo B with 3 Afterimages wins 68.3% ±2.6; with 1 it wins 51.0% ±2.8 (n=1200 each). The premade runs 1. The free builder (CV-4) will let players run 3, so Afterimage must be fixed before CV-4.
- **Starters stay unchanged** (CV-2 c1). Candidate swaps are listed but not applied.

## Player problem
A returning player who has seen all 4 starters wants a different way to play the same house. Today each house has one plan, and 108 cards cover it.

## Conventions used below
- **Wave 1 (W1)** means the card uses only effect ids that the engine already dispatches (`targetSpecFor`, `applyEffect`, `lastWords`), static fields that already exist (`grow`, `guard`, `shield`, `rally`, `echo`, `token`), or the single parameter variant **P1**.
- **P1, `cultist:M:K`**: Sacrifice another allied unit with power ≤ M (`M` may be `any`), then this gains the sacrificed unit's power + K.
  - The legacy `cultist` stays, and equals `cultist:3:2`.
  - Engine change: add one `case 'cultist': if (a1)` branch in the first switch of both `targetSpecFor` (`ally(u => a1 === 'any' || u.power <= n1, 0, 1, ...)`) and `applyEffect` (copy the second-switch body with `u.power + n2`). Prototyped in about 3 lines.
  - Its text template is "You may Sacrifice another allied unit[ with M or less power]; this gains its power[ +K]."
- **Wave 2 (W2)** means the card needs a new effect, condition, trigger or flag (section "Wave 2 effects").
- **Row** is the printed hint (`rows`). Every unit can still go in either row.
- **Text** is the exact `text` to ship. It follows the wording of the existing card with the same effect id, so E1 can generate it from the definition.
- **E2 check:** no wave-1 card combines Rally or Echo with a targeted Deploy. The targets a player picks are therefore the targets the engine resolves.
- **Invariant 5 nits inherited, not new:**
  - Marsh Lurker and Gulletmaw use `drain`, which grants its gain even when Shield blocks the loss, exactly like Leech Vine.
  - Ash Lancer uses `burnstrongest`, which skips a Guarded Back row, exactly like Bounty Hunter.
  - Fold both into E8's text pass.
- **IP check:** every name and text below is original. None is a Gwent card name, and keyword names follow the research doc's renames (Bond→Kinship, Consume→Devour, Thrive→Flourish, Berserk→Enrage, Resurrect→Rekindle, Spying→Infiltrate, Resilience→Endure). "Fen Ghoul" was renamed Marsh Lurker because "Ghoul" is a Gwent card.

## 1. The new cards

Archetype key: **A** is the starter plan, **B** is the new deck, **any** is a generic tool.

### Coven (15): B = Devour ("Hungry Mire")

| id | Name (epithet) | Tier | Pow | Row | Statics | Effect | Rules text | Wave | Arch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| brood-sac | Brood Sac | C | 1 | B | grow, token Grub | lastWords `token2:2` | Grow. Last Words: Summon two 2-power Grubs in this row. | W1 | B |
| husk-beetle | Husk Beetle | C | 3 | F | token Husk | lastWords `token:3` | Last Words: Summon a 3-power Husk in this row. | W1 | B |
| pit-maw | Pit Maw | C | 2 | F | | `cultist:4:3` (P1) | Deploy: You may Sacrifice another allied unit with 4 or less power; this gains its power +3. | W1 | B |
| bog-bloater | Bog Bloater | C | 7 | F | | `selfpoison` | Deploy: Poison this unit. | W1 | any |
| bramblehide | Bramblehide | C | 3 | F | grow, shield | | Grow. Shield. | W1 | A |
| marsh-lurker | Marsh Lurker | R | 4 | F | | `drain:3` | Deploy: A Poisoned enemy unit loses 3 and this gains 3. | W1 | A/B |
| gut-hag | Gut Hag | R | 3 | F | token Husk | `cultist:4:3` (P1); lastWords `token:3` | Deploy: You may Sacrifice another allied unit with 4 or less power; this gains its power +3. Last Words: Summon a 3-power Husk in this row. | W1 | B |
| bog-widow | Bog Widow | R | 5 | B | | resolve `vespera` | Resolve: Every Poisoned enemy unit loses 2. | W1 | A |
| the-bottomless | The Bottomless (the maw below) | L | 4 | F | | `cultist:any:3` (P1) | Deploy: You may Sacrifice another allied unit; this gains its power +3. | W1 | B |
| gulletmaw | Gulletmaw (the drowned jaw) | L | 4 | F | | `drain:5` | Deploy: A Poisoned enemy unit loses 5 and this gains 5. | W1 | A/B |
| creeping-ivy | Creeping Ivy | C | 2 | B | flourish | NEW: flourish | Flourish: after you play another unit with more power than this, this gains 1. | W2 | B |
| ivy-shambler | Ivy Shambler | C | 2 | F | flourish, token Spore | NEW: flourish; lastWords `token:2` | Flourish: after you play another unit with more power than this, this gains 1. Last Words: Summon a 2-power Spore in this row. | W2 | B |
| rot-gobbler | Rot Gobbler | C | 3 | F | | NEW: `devour:2` | Deploy: Devour a Poisoned enemy unit with 2 or less power: destroy it, and this gains its power. | W2 | A/B |
| mossback-elder | Mossback Elder | R | 4 | F | flourish, shield | NEW: flourish | Shield. Flourish: after you play another unit with more power than this, this gains 1. | W2 | B |
| sunken-mother | The Sunken Mother (the deep cradle) | L | 3 | F | | NEW: `devour:6` | Deploy: Devour a Poisoned enemy unit with 6 or less power: destroy it, and this gains its power. | W2 | B |

Most-worried interaction: **The Bottomless eating Swamp Colossus.** This cleanses the Poison and leaves one unit of about 16 power, which only Vorok's Resolve, Bounty Hunter chip damage and wave 2's Last Dawn can answer. It is fine in the premade (one Colossus, one Bottomless), but watch it in CV-4.

### Order (15): B = Levy (go wide, then pay off width)

| id | Name (epithet) | Tier | Pow | Row | Statics | Effect | Rules text | Wave | Arch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| conscript | Conscript | C | 3 | F | rally 1 | | Rally 1. Other units in this row gain 1. | W1 | B |
| war-drummer | War Drummer | C | 1 | B | | `allboost:1` | Deploy: Your other units gain 1. | W1 | B |
| drill-sergeant | Drill Sergeant | C | 3 | F | echo 2, token Recruit | | Echo 2. Summon a 2-power Recruit in your other row. | W1 | B |
| gate-warden | Gate Warden | C | 3 | F | guard, token Recruit | lastWords `token:3` | Guard. Last Words: Summon a 3-power Recruit in this row. | W1 | A |
| arbalest-line | Arbalest Line | R | 4 | B | | `rowburn:1` | Deploy: Burn 1 to every enemy unit in a row. | W1 | any |
| tower-warden | Tower Warden | R | 7 | F | guard | | Guard. | W1 | A |
| bastion | Bastion (special) | R | - | - | | `shield:3` | Give Shield to up to 3 allied units. | W1 | A |
| bellwarden | The Bellwarden (the muster bell) | L | 1 | B | | `allboost:2` | Deploy: Your other units gain 2. | W1 | B |
| brannoc | Ser Brannoc (the challenger) | L | 5 | F | shield | `duellow:5` | Shield. Deploy: Duel an enemy unit with 5 or less power. | W1 | A |
| pike-brother | Pike Brother | C | 4 | F | | NEW: `kinship:2` | Kinship 2: when played, this gains 2 for each other Pike Brother on your side. | W2 | B |
| levy-spearman | Levy Spearman | C | 2 | F | | NEW: muster | Muster: when you play this, every Levy Spearman left in your deck is played into the same row too. | W2 | B |
| line-captain | Line Captain | C | 3 | E | | NEW: `stance:selfshield\|burn:2` | Deploy: If this is in your Front row, it gains Shield. If it is in your Back row, Burn 2. | W2 | any |
| sworn-sister | Sworn Sister | R | 5 | F | shield | NEW: `kinship:3` | Shield. Kinship 3: when played, this gains 3 for each other Sworn Sister on your side. | W2 | A |
| last-watch-captain | Captain of the Last Watch | R | 5 | F | guard | NEW: lastLight `allboost:1` | Guard. Last Light (Round 3): Your other units gain 1. | W2 | A/B |
| old-bastion | The Old Bastion (the unbroken gate) | L | 6 | F | guard, endure | NEW: endure | Guard. Endure: when the round ends, this stays on the board for the next round (once). | W2 | A |

Tuning already applied from the prototype: Bellwarden's power went from 3 to 1 and War Drummer's from 2 to 1. Gate Warden at 3 power with a 2-power Recruit dragged Order B to 31.8% ±2.6 (n=1200) when it replaced Squire, so its Last Words token rose to 3. That change is untested; the card is in no premade.

Most-worried interaction: **Rally stacking**, not Bellwarden.
- Order B with 3 Squires, 2 Standard Bearers and 2 Mercenary Captains won 62.6% ±2.7 (n=1200).
- Cutting 3 Squires for Lancers brought it to 56.3%.
- Rally from cards that already exist is the lever the free builder will find.

### Ember (15): B = Wildfire (chip everything, then finish it)

| id | Name (epithet) | Tier | Pow | Row | Statics | Effect | Rules text | Wave | Arch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| spark-flinger | Spark Flinger | C | 2 | B | | `burnmulti:1:3` | Deploy: Burn 1 to up to 3 enemy units. | W1 | B |
| cinder-reaper | Cinder Reaper | C | 3 | F | | `execute:3` | Deploy: Destroy an enemy unit with 3 or less power. | W1 | B |
| torchbearer | Torchbearer | C | 5 | F | | resolve `burnmulti:1:3` | Resolve: Burn 1 to up to 3 enemy units. | W1 | B |
| furnace-brute | Furnace Brute | C | 8 | F | | `allylose:1` | Deploy: Your other units lose 1. | W1 | A/B |
| ash-lancer | Ash Lancer | C | 4 | F | | `burnstrongest:2` | Deploy: Burn 2 to the strongest enemy unit. | W1 | B |
| ember-storm | Ember Storm (special) | R | - | - | | `burnmulti:2:3` | Burn 2 to up to 3 enemy units. | W1 | B |
| ember-wraith | Ember Wraith | R | 3 | B | | lastWords `burnrandom:4` | Last Words: Burn 4 to a random enemy unit. | W1 | A/B |
| sulka | Sulka (the cinder bride) | L | 4 | B | | `sweep:3:3` | Deploy: Every enemy unit with 3 or less power loses 3. | W1 | B |
| ash-raider | Ash Raider | C | 4 | F | | NEW: `ifdamaged:2:selfgain:3` | Deploy: If 2 or more enemy units are damaged, this gains 3. | W2 | B |
| cinder-jackal | Cinder Jackal | C | 3 | F | | NEW: `burndamaged:3` | Deploy: Burn 3 to a damaged enemy unit. | W2 | B |
| brazen-bull | Brazen Bull | C | 4 | F | | NEW: `enrage:5` | Enrage 5: the first time each round this loses power and survives, it gains 5. | W2 | A |
| cinder-hunter | Cinder Hunter | R | 4 | B | | NEW: `burnbydamaged` | Deploy: Burn an enemy unit by 1 for each damaged enemy unit. | W2 | B |
| ash-priestess | Ash Priestess | R | 3 | B | | NEW: `rekindle:common:1` | Deploy: Rekindle the strongest Common unit in your discard pile into this row. Its Deploy does not trigger. | W2 | A |
| kharza | Kharza (the unquenched) | L | 5 | F | | NEW: `enrage:kharza` | Enrage: the first time each round this loses power and survives, it gains 5 and Burns 5 to the strongest enemy unit. | W2 | A |
| pyre-saint | The Pyre Saint (the second flame) | L | 4 | B | | NEW: `rekindle:low5:2` | Deploy: Rekindle the 2 strongest non-Legend units with 5 or less power in your discard pile into this row. Their Deploy does not trigger. | W2 | A |

Most-worried interaction: **Cinder Reaper, a Common Destroy that ignores Shield.** It hits Thornlings, Seed Keepers and every Echo token. The feared case, Sulka against token decks, did not show up: Ember B vs Echo A was 46.9% ±4.9 (n=400). Coven A vs Ember B did fail: 33.1% ±4.6.

### Echo (15): B = Mimic ("Mirror Court": make one big unit, then copy it)

| id | Name (epithet) | Tier | Pow | Row | Statics | Effect | Rules text | Wave | Arch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mirror-mote | Mirror Mote | C | 2 | B | | `copyally:4` | Deploy: Choose another allied unit with 4 or less power. Summon an Echo with its power in its other row. | W1 | B |
| reroute | Reroute (special) | C | - | - | | `shift:3` | Move an enemy unit to its other row; it loses 3. | W1 | any |
| decoy-drone | Decoy Drone | C | 2 | F | guard, echo 2 | | Guard. Echo 2. Summon a 2-power token in your other row. | W1 | A/B |
| fork-runner | Fork Runner | C | 4 | F | echo 3 | | Echo 3. Summon a 3-power token in your other row. | W1 | A/B |
| looking-glass | Looking Glass | R | 1 | F | | `mirror` | Deploy: Choose an enemy unit. If it has more power, this becomes its power. | W1 | B |
| echo-lens | Echo Lens | R | 3 | B | | `afterimage` | Deploy: Summon an Echo with the power of your strongest unit (this one counts; if tied, the one that reached the board first) in that unit's other row. | W1 | B |
| signal-tower | Signal Tower | R | 5 | B | | resolve `echo4` | Resolve: Summon a 4-power Echo in your other row. | W1 | A |
| amplify | Amplify (special) | R | - | - | | `tokenboost:2` | Your tokens gain 2. | W1 | A |
| facet-queen | Facet Queen (the thousand faces) | L | 4 | B | | `copyally:10` | Deploy: Choose another allied unit with 10 or less power. Summon an Echo with its power in its other row. | W1 | B |
| double-agent | Double Agent | C | 2 | - | infiltrate | NEW: infiltrate + `seize:4` | Infiltrate. Deploy: Take control of another enemy unit with 4 or less power. | W2 | B |
| mimicry | Mimicry (special) | C | - | - | | NEW: `copyenemy:4` | Choose an enemy unit with 4 or less power. Summon an Echo with its power in the same row on your side. | W2 | B |
| dusk-signal | Dusk Signal | C | 3 | B | | NEW: lastLight `echo4` | Last Light (Round 3): Summon a 4-power Echo in your other row. | W2 | A |
| ghost-agent | Ghost Agent | R | 4 | - | infiltrate | NEW: infiltrate + `draw:2` | Infiltrate. Deploy: Draw 2 cards. | W2 | B |
| face-stealer | Face Stealer | R | 3 | F | | NEW: `copyenemy:6` | Deploy: Choose an enemy unit with 6 or less power. Summon an Echo with its power in the same row on your side. | W2 | B |
| last-broadcast | The Last Broadcast (the final signal) | L | 4 | B | | NEW: lastLight `echo3x3` | Last Light (Round 3): Summon three 3-power Echoes in your other row. | W2 | A |

Most-worried interaction: **Afterimage copying a mirrored unit.** Looking Glass or Mirrorjack copies the enemy's biggest unit, then Afterimage or Echo Lens copies it again. That makes 2-3 bodies of 10+ power from Commons and Rares. Measured: 3 Afterimages give 68.3% ±2.6 and 1 gives 51.0% ±2.8 (n=1200 each). Looking Glass and Echo Lens were *not* the driver: swapping either out moved the result inside the CI or raised it.

### Neutral (8)

| id | Name (epithet) | Tier | Pow | Row | Statics | Effect | Rules text | Wave | Arch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rockslide | Rockslide (special) | R | - | - | | `rowburn:2` | Burn 2 to every enemy unit in a row. | W1 | wide fallback |
| executioner | Executioner | R | 4 | F | | `execute:4` | Deploy: Destroy an enemy unit with 4 or less power. | W1 | engine answer |
| lamplighter | Lamplighter | C | 3 | B | | resolve `boost:4` | Resolve: Boost another allied unit by 4. | W1 | any |
| tinker | Tinker | C | 3 | B | | `shield:1` | Deploy: Give another allied unit Shield. | W1 | any |
| scrap-golem | Scrap Golem | C | 4 | F | token Scrap | lastWords `token:2` | Last Words: Summon a 2-power Scrap in this row. | W1 | sacrifice fodder |
| last-dawn | The Last Dawn (special) | L | - | - | | NEW: purge | Destroy every unit on the board, on both sides, that has the highest power. Tokens too. | W2 | tall fallback |
| night-watchman | Night Watchman | C | 4 | F | | NEW: lastLight `selfgain:4` | Last Light (Round 3): This gains 4. | W2 | any |
| old-campaigner | Old Campaigner | R | 4 | F | endure | NEW: endure | Endure: when the round ends, this stays on the board for the next round (once). | W2 | any |

### Counts and tier mix

| | W1 C/R/L | W2 C/R/L | Total |
| --- | --- | --- | --- |
| Coven | 5/3/2 = 10 | 3/1/1 = 5 | 15 (C8 R4 L3) |
| Order | 4/3/2 = 9 | 3/2/1 = 6 | 15 (C7 R5 L3) |
| Ember | 5/2/1 = 8 | 3/2/2 = 7 | 15 (C8 R4 L3) |
| Echo | 4/4/1 = 9 | 3/2/1 = 6 | 15 (C7 R6 L2) |
| Neutral | 3/2/0 = 5 | 1/1/1 = 3 | 8 (C4 R3 L1) |
| **All** | **41** | **27** | **68** (C34 R22 L12) |

- The pool grows from 108 cards to 149 after wave 1 and 176 after wave 2.
- Each house grows from 24 to 39 cards, about 20 Commons, 10 Rares and 9 Legends.
- A deck uses at most 4 Legends and 6 Rare copies and at least 15 Commons, so the Common share stays the largest.
- Rares run high on purpose: card draw, Infiltrate and Rekindle are card advantage, and the Rare cap limits them (research §1.5).

## 2. Wave 2 effects
Each new effect is defined once in E1's registry. Wave 2 does not start before E1. Muster also needs E4, because uids must be assigned after the shuffle before deck cards appear in events. Stance needs E1's target spec to take the chosen row, which E2 already asks for. Each effect lists the cases qa-engineer must test (at least 3).

1. **`kinship:n` (Kinship)**: on Deploy, this gains n × the number of *other* units on your side with the same card id. The unit's owner and Silence don't matter; tokens never count.
   - (a) The third copy, with 2 copies already in play, gains 2n.
   - (b) A copy the enemy took control of doesn't count for you; an enemy copy you took does.
   - (c) A copy destroyed earlier this round doesn't count.
2. **`muster` (Muster)**: after this unit lands and its own effects resolve, every card with the same id in your deck leaves the deck, in deck order, and lands in the same row until the row is full. Mustered copies trigger no Muster, Deploy, Rally or Echo.
   - (a) 2 copies in the deck both land and the deck shrinks by 2.
   - (b) With 5 units in the row, 1 copy lands and the other stays in the deck.
   - (c) Copies in hand stay in hand.
   - (d) Event payloads carry no uid of any deck card that did not land (invariant 6, E4).
3. **`devour:n` (Devour)**: target a Poisoned enemy unit with power ≤ n (Guard applies). Destroy it, so Shield doesn't stop it and its Last Words fire for its owner. This then gains the power the target had.
   - (a) A Shielded, Poisoned target is destroyed and its power is gained.
   - (b) A Guard in the Front row hides Back-row targets.
   - (c) An enemy Sporeling devoured leaves a Spore on the *enemy's* side.
   - (d) With no legal target, the card plays with no effect.
4. **`flourish` (Flourish)**: a unit flag. After a card you play from your hand finishes resolving (Rally, Echo and Deploy), each of your *other* non-silenced Flourish units with less power than the played unit gains 1.
   - (a) The played unit's power is read *after* its Deploy: Pit Maw at 2 that eats up to 8 does trigger.
   - (b) Summoned tokens, Mustered copies, specials and Infiltrated units do not trigger it.
   - (c) Equal power does not trigger it, and a Silenced Flourish unit doesn't gain.
5. **`enrage:n` / `enrage:kharza` (Enrage)**: a unit flag with a once-per-round marker, checked inside `lose()`. When this unit actually loses power (Shield did not block) and is still above 0, it gains n the first time that round. Kharza also burns 5 to the strongest enemy unit.
   - (a) A Poison tick triggers it once: Coven's Poison feeds Enrage.
   - (b) A Shield-blocked hit and a lethal hit don't trigger it.
   - (c) Silence removes Enrage, and the marker resets each round.
   - (d) Mid-Duel, the enraged power is what hits back next.
6. **Damaged** (a glossary term, not a keyword) and its effects. A unit is *damaged* while `power < base`.
   - `ifdamaged:N:<eff>` runs `<eff>` only if at least N enemy units are damaged.
   - `burndamaged:n` burns n to a target, chosen only from damaged enemy units.
   - `burnbydamaged` burns X, where X is the number of damaged enemy units counted when it resolves.
   - Tests:
     - (a) A unit Boosted 4→7 that then loses 2 is *not* damaged.
     - (b) A token's base is the power it was summoned with.
     - (c) Mirrorjack after mirroring keeps its old base, so it counts as damaged only below that base.
     - (d) Cinder Hunter's count includes its own target.
7. **`rekindle:<filter>:<k>` (Rekindle)**: deterministic, with no choice UI. Take the k units in *your* discard pile with the highest printed power that match the filter (`common`: Common units; `low5`: non-Legend units with printed power ≤5). Ties go to the most recently discarded. Each unit leaves the discard pile and lands in this card's row as a fresh unit (base = printed power, printed statics). Deploy, Rally and Echo don't trigger; Last Words work.
   - (a) Ties resolve by recency.
   - (b) A rekindled Ember Sprite's Last Words fire when it dies again.
   - (c) With the row full, the card stays in the discard pile.
   - (d) A unit of yours that died on the enemy side (it had been taken) went to *your* discard pile, so it can be rekindled.
8. **`infiltrate` (Infiltrate)**: a unit flag. The play action's row names the *opponent's* row, and the unit lands on their side but stays owned by you (`owner`), so it goes to your discard pile. Its Deploy resolves for you, and targets are chosen before it lands.
   - (a) Its power counts toward the opponent's total.
   - (b) Draw 2 respects the hand limit of 10 (overflow goes to the discard pile).
   - (c) A full opponent row is not a legal row.
   - (d) The opponent's Rally, War Drummer and Bellwarden boost it; their Kinship and Flourish don't count it as "played".
   - Needs: a client drop target, a protocol check that the row is on the enemy side, and bot candidate rows.
9. **`endure` (Endure)**: a unit flag. In `endRound`, a non-silenced Endure unit is not cleared. It keeps its power, Guard and Shield, loses Poison and Endure, and starts the next round on the board.
   - (a) It counts toward the next round's total from the first turn and can be targeted.
   - (b) Silence before the round ends cancels it.
   - (c) In a match-ending round nothing persists, and a unit the opponent took endures on their side.
10. **Last Light** (a keyword; a new card slot `lastLight?: EffId`, like `resolve`): the effect triggers on play only when `round === 3`, and otherwise does nothing.
    - (a) Played in Round 1 or 2, nothing happens.
    - (b) Round 3 is reached after a tied Round 2.
    - (c) A card with both Resolve and Last Light is not allowed. Add a registry check.
11. **`purge`** (no keyword; uses Destroy): find the highest power on the board once, then destroy every unit at that power on both sides, tokens included, ignoring Shield and Guard. Last Words resolve afterwards: the opponent's units, then yours.
    - (a) Ties on both sides all die, including yours.
    - (b) A Last Words token that matches that power survives, because the set is fixed first.
    - (c) On an empty board, nothing happens.
12. **`stance:<F>|<B>`** (no keyword): at Deploy, run `<F>` if this unit is in your Front row and `<B>` if it is in the Back row. Here `selfshield` gives this unit Shield. The target spec depends on the chosen row.
    - (a) Played Front, it gets Shield and needs no target.
    - (b) Played Back, it needs a Burn 2 target.
    - (c) Moving it later doesn't trigger the effect again.
13. **`copyenemy:n`** (no keyword): target an enemy unit with power ≤ n (Guard applies). Summon a token with its current power in the same row letter on your side.
    - (a) Guard hides Back-row targets.
    - (b) With your row full, nothing is summoned.
    - (c) The copy is a token: it vanishes at round end, Lattice and Amplify boost it, and it has no Last Words.

Small helpers used above, all defined in E1 rather than as one-off names: `selfgain:n`, `echo3x3` (three Echo summons; or `echo:n:k`), `selfshield`.

## 3. The 8 premades
Every list is legal under `validateDeck`: the prototype checked all 8, and CI must too (CV-2 c1). **Deck 1 of each house is today's starter, unchanged** (CV-2 c1). Names are original and are shown in the picker and as the bot's deck name.

**Bot eligibility, all decks:** no wave-1 card needs a new action, target kind or protocol field, so all 8 are bot-eligible once they pass the band below. The bot is a one-ply greedy policy (shared/bot.ts):
- It sees Sacrifice and Last Words value only when a Sacrifice actually happens that turn.
- It holds Resolve cards (−2.5 penalty).
- Its target combinations are capped at 40, so cards that hit "up to 3" targets explore only part of the space on wide boards.

### Coven
**Rot and Root** (`coven-a`, the starter)
> Poison their units early so they drain every turn, and plant Grow units that build while you wait.
> Wins long rounds; Vespera, Mire Toad and Venom Spitter cash in every Poisoned unit.

Unchanged list. Bot: eligible, already played today. Candidate swap (not applied; needs a sim report): −3 Bog Brute, +3 Bramblehide. The prototype shows Coven A losing to both Ember decks (40.4% ±4.8 and 33.1% ±4.6, n=400 each).

**The Hungry Mire** (`coven-b`)
> Lay down small units that leave something behind when they die, then feed them to your maws for power.
> Poisoned enemies are food too: Gulletmaw drains them. Plays tall where Rot and Root plays slow.

- L: the-bottomless, gulletmaw, mawroot, simmer
- R: seed-keeper ×2, gut-hag ×2, plague-doctor, swamp-colossus
- C: pit-maw ×3, brood-sac ×3, sporeling ×3, hex-doll ×3, husk-beetle ×3

Bot: eligible. It never sets fodder up on purpose; it sacrifices only when that turn's result is better. Expect real players to do better with this deck than the bot does.
W2 swaps: −3 husk-beetle +3 creeping-ivy; −simmer +sunken-mother.

### Order
**The White Wall** (`order-a`, the starter)
> Build a Front row of Shield and Guard that removal can't crack, and stack Rally and Hold the Line on it.
> Keep Kestra and Ilse for the last say once they pass.

Unchanged. Bot: eligible. Candidate swap (not applied): −1 Inquisitor +1 Tower Warden.

**The Levy** (`order-b`)
> Fill both rows with cheap soldiers and Recruits, then raise them all at once with drummers, banners and the Bellwarden.
> The wider the army, the bigger every boost. Spread across rows to blunt row-wide burns.

- L: bellwarden, odric, ilse, kestra
- R: standard-bearer ×2, merc-captain ×2, quartermaster, arbalest-line
- C: conscript ×3, drill-sergeant ×3, war-drummer ×3, lancer ×3, archer ×3

Bot: eligible; it handles Rally ordering well, because the Rally lands that turn.
W2 swaps: −3 drill-sergeant +3 levy-spearman; −3 conscript +3 pike-brother; −kestra +old-bastion.

### Ember
**Pyre and Blade** (`ember-a`, the starter)
> Burn their best unit every round and Sacrifice small units into Skarr and Ash Cultists.
> Wins short rounds; Vorok's Resolve ends the long ones.

Unchanged. Bot: eligible.

**Wildfire** (`ember-b`)
> Spread small burns across their whole board, then finish what's left with Reapers, Azhar and Sulka.
> Furnace Brutes and Ash Lancers carry the points while the fire does the work.

- L: hue, matron-cinder, sulka, azhar
- R: ember-storm ×2, flame-warden ×2, ember-wraith, infernal-hound
- C: spark-flinger ×3, furnace-brute ×3, cinder-reaper ×3, ash-lancer ×3, torchbearer ×3

Bot: eligible. Spark Flinger and Torchbearer hit up to 3 targets, so the bot misses some target sets on boards wider than about 6 units.
W2 swaps: −3 torchbearer +3 cinder-jackal; −3 ash-lancer +3 ash-raider; −infernal-hound +cinder-hunter.

### Echo
**Static Swarm** (`echo-a`, the starter)
> Flood both rows with tokens, pump them with Lattice, then steal and shove their units out of place.
> Too wide to burn down one unit at a time.

Unchanged. Bot: eligible.

**Mirror Court** (`echo-b`)
> Take or mirror their biggest unit, then copy it with Mirror Motes, Replicators and the Facet Queen.
> Few units, all large; Reroute breaks up their Guard and Rally rows.

- L: mirrorjack, facet-queen, null9, aiden
- R: looking-glass ×2, echo-lens ×2, replicator ×2
- C: mirror-mote ×3, fork-runner ×2, decoy-drone, patchwork ×3, afterimage, signal-ghost ×2, reroute ×3

Bot: eligible. **Afterimage is held at 1 copy on purpose** (see "Read this first"). Never raise it without a sim report.
W2 swaps: −3 reroute +3 mimicry; −2 echo-lens +ghost-agent +face-stealer.

## 4. Balance plan
**Every number here is bot-vs-bot: one greedy policy, not players.** Replace these numbers with CV-1 human data per premade once it reaches about 200 human matches per deck (±7 points); until then, the sim is the gate.

**CI used:** ±1.96·√(p(1−p)/n). At p=0.5, that is ±4.9 at n=400, ±2.8 at n=1200, ±2.2 at n=2000 and ±2.0 at n=2400.

### Baseline today (`npm run sim -- 200` at 7e39dd2: 200 games per ordered pair, so 400 per pairing)
| | COVEN | ORDER | EMBER | ECHO |
| --- | --- | --- | --- | --- |
| COVEN | - | 53 | 39 | 48 |
| ORDER | 43 | - | 51 | 40 |
| EMBER | 56 | 45 | - | 44 |
| ECHO | 49 | 56 | 53 | - |

Each cell is ±4.9.
- Coven vs Ember is 39% [34.2, 43.8]: it already overlaps the 40% floor *before any new card*.
- Overall (n=2400 games): first seat won 45.8% ±2.0, second seat 50.0%, draws 4.2%, Round 3 was played in 93% of matches, 23.9 plays per match.

### Prototype of the wave-1 premades (done for this spec)
- Built in a scratch copy of shared/ with P1 and the 41 wave-1 cards.
- Fuzz: 700 matches with random legal decks drawn from the new pool, all OK.
- Matrix: 28 pairings × 400 games = 11,200 games. Seeds are per pairing, unlike `runMatrix`, whose seeds depend on the house name's length.
- Tuning steps taken:
  - Echo B: Afterimage 3→1, Fork Runner 3→2, Signal Ghost ×2 and Decoy Drone ×1 added.
  - Order B: Squire ×3 → Lancer ×3; Bellwarden power 3→1; War Drummer power 2→1.
  - Ember B: Flame Juggler ×3 → Furnace Brute ×3, Pyromancer ×3 → Ash Lancer ×3.

Each deck's result against all six decks of the other three houses (n=2400 each, CI ±2.0):

| Deck | First draft | Tuned (lists above) |
| --- | --- | --- |
| Rot and Root (A) | 46.4 | 49.4 |
| The Hungry Mire | 46.6 | 49.2 |
| The White Wall (A) | 50.0 | 49.3 |
| The Levy | 63.0 | 53.6 |
| Pyre and Blade (A) | 43.3 | 48.1 |
| Wildfire | 31.6 | 51.1 |
| Static Swarm (A) | 50.7 | 48.0 |
| Mirror Court | 68.4 | 51.3 |

Tuned overall: first seat won 50.9% ±0.9 (n=11,200), draws 3.8%, Round 3 in 93% of matches.

Pairings in the tuned set whose 95% CI lies **entirely outside 40-60** (n=400, ±4.6-4.9):
- Rot and Root vs **The Levy**: 67.3% for Coven A, so Levy is the loser.
- Rot and Root vs **Wildfire**: 33.1% for Coven A.
- **The Levy** vs Static Swarm: 67.0% for Levy.

Inconclusive pairings, whose CI crosses 40 or 60 (n=400): Levy vs Pyre and Blade 62.6%, Levy vs Mirror Court 61.0%, White Wall vs Mirror Court 36.8%, Hungry Mire vs Mirror Court 38.8%. **Verdict: every deck's aggregate is inside the band, but CV-2 c2 (each pairing 40-60) is not met yet. The Levy is the main offender, swinging in both directions.**

### Runs once wave 1 is built (the gate for CV-2 c2)
1. Tooling (engine-dev, part of CV-2):
   - Today `runMatrix` only plays starters by house. Add a premade matrix: every ordered pair of the 8 premade ids, alternating seats, with seeds derived from the pair index.
   - Port the prototype to `scripts/analysis/premade-matrix.ts`, which prints per-pairing win%, the CI and the 8 aggregates.
   - Write results to `docs/balance/<date>-cards-v2-wave1.md`.
2. Screening: `npm run sim -- 200` in premade mode, 200 games per ordered pair (400 per pairing, ±4.9).
3. Confirmation: 1,000 per ordered pair (2,000 per pairing, ±2.2), as CV-2 c2 requires.
4. Fuzz: `npm run check` already fuzzes random legal decks, which now include every new card.

### Pass/fail band
- **Per cross-house pairing (gating):**
  - PASS if the whole 95% CI is inside [40%, 60%]; at n=2000, the point estimate must be in [42.2, 57.8].
  - FAIL if the whole CI is outside it.
  - Otherwise INCONCLUSIVE: double the games once, then decide.
- **Per deck aggregate** vs the 6 decks of other houses (n=12,000 at confirmation, ±0.9): within [45, 55].
- **Health metrics** (not gating; flag to Aiden): first-seat share outside [45, 55]; draws above 8%; Round 3 rate moving more than 10 points from the 93% baseline.
- Same-house pairings (A vs B) are reported but don't gate: the bot never plays the player's house.

### Cards most worth watching
1. **Afterimage (an existing Common) in copy decks.** 3 copies: Mirror Court wins 68.3% ±2.6; 1 copy: 51.0% ±2.8 (n=1200). Safe in the premade, but CV-4 opens it. Fix the card before CV-4: make it Rare, or copy only units with 6 or less power.
2. **Rally stacking for The Levy and The White Wall.** Squire, Standard Bearer and Mercenary Captain made Levy 62.6% ±2.7 (n=1200). Levy's pairings swing from 33% to 67%. Single cards move a deck by 10-30 points under this bot: Gate Warden at 3 power instead of Squire took Levy from 62.6 to 31.8. Expect fragile tuning and retune it as a whole package (research §1.7).
3. **Wildfire against Coven A** (33.1% ±4.6 for Coven), plus Cinder Reaper and Executioner. Cheap Destroy that ignores Shield kills Grow engines before they pay off. If confirmed at n=2000, adjust Coven A first, with the candidate swap above, rather than nerfing Ember B.
4. Watch list, wave 2:
   - Enrage fed by Poison ticks.
   - Ghost Agent's draw 2 (+1 card per copy).
   - Endure's round-control lead into Round 2.
   - Muster thinning, combined with Bellwarden's +2 per unit.

## 5. README and KEYWORDS changes
**Wave 1 adds no keyword.** README changes for wave 1:
- "108 cards" → "149 cards: Coven 34, Order 33, Ember 32, Echo 33 and Neutral 17". Regenerate the card tables.
- How to play, step 1: "Pick a deck: two premade decks per house, or build your own." (CV-3 wording.)
- Add a "Premade decks" list: name, house and the 2-line plan for each of the 8.

**Wave 2 KEYWORDS entries for shared/cards.ts** (`kw` / `match` / `t`):

| kw | match | t |
| --- | --- | --- |
| Kinship | `/Kinship/` | When played, this gains that much for each other unit with the same name already on your side. |
| Muster | `/Muster/` | When you play this, every copy of it still in your deck is played into the same row too. Their own effects don't trigger. |
| Devour | `/Devour/` | Destroy the chosen unit; this unit gains the power it had. Shield does not stop it. |
| Flourish | `/Flourish/` | After you play another unit with more power than this one, this gains 1. |
| Enrage | `/Enrage/` | The first time each round this unit loses power and survives, its Enrage effect happens. A Shield-blocked hit doesn't count. |
| Rekindle | `/Rekindle/` | Return a unit from your discard pile to the board. Its Deploy does not trigger. |
| Infiltrate | `/Infiltrate/` | Played onto your opponent's side of the board: its power counts for them. Its Deploy still works for you. |
| Endure | `/Endure/` | When the round ends, this unit stays on the board for the next round, once. It loses Poison. |
| Last Light | `/Last Light/` | Triggers when you play the card, but only in Round 3. |
| Damaged | `/damaged/` | A unit is damaged while its power is below the power it entered the board with. |

README changes for wave 2:
- The same 10 rows go in the Keywords table.
- "The board clears between rounds" gains "(except Endure units)".
- "The board" section gains: "Infiltrate cards go on your opponent's rows."
- "149 cards" → "176 cards: 39 for each house and 20 Neutral".

## Acceptance criteria
1. Given wave 1 is merged, then CARDS has exactly the 41 W1 cards above, with these ids, tiers, powers, statics, effect ids and text. A per-card vitest proves each card's text against the engine (invariant 5; CV-2 c3). This applies to *all* 41 cards, not only those in premades, because the PvP builder reaches every card.
2. Given `cultist:M:K`, then the legacy `cultist` behaves exactly as before (the existing Ash Cultist tests pass unchanged), `M = any` accepts any other allied unit including tokens, and the sacrificed unit's Last Words fire.
3. Given the deck registry, then the 8 lists above are present under their names, all pass `validateDeck` in CI, and the 4 starters are byte-identical to `STARTERS`.
4. Given the premade matrix at 2,000 games per pairing, then every cross-house pairing passes the band. Otherwise the failing pairings go back to game-designer with the report, and the deck is not marked bot-eligible.
5. Given wave 2, then each of the 13 effects exists once in E1's registry with the qa cases above, and the KEYWORDS and README rows land in the same PR as the first card that uses them.

## Out of scope
- Coins, row hazards, weather, Order/Charge activated abilities, leaders, mulligan, provisions: separate epics (research §3-4).
- Vigil and Afterglow, the original mechanics the research proposed: held for a later set; Last Light is this set's original keyword.
- Changing any starter list (candidates noted only).
- Card art: placeholders until Aiden supplies it.

## Success metric
- Per premade and card-data version: the human win rate against the bot, and the pick rate in the picker (CV-1 events `match_start` deck source and premade id, `match_end`).
- Per new card: play rate and the win rate when played (CV-1 question 2).
- Target: every premade is picked by at least 5% of matches and has a human win rate against the bot between 35% and 65%, read at 200 or more matches per deck (±7).

## Open questions for Aiden
1. The 4 new deck names (The Hungry Mire, The Levy, Wildfire, Mirror Court) and the 4 starter names (Rot and Root, The White Wall, Pyre and Blade, Static Swarm). Are they OK for the picker and as the bot's deck name?
2. The keyword names are placeholders taken from the research renames: Kinship, Muster, Devour, Flourish, Enrage, Rekindle, Infiltrate, Endure, Last Light. Approve or rename them before wave 2.
3. Afterimage: fix it before CV-4 (recommended), or accept a 68% copy deck in the free builder?

<!-- architect appends "## Design" below; red-team objections and responses go under "## Challenge" -->
