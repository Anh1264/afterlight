# AFTERLIGHT

A two-player online card duel. Each turn you play one card or pass. Win two rounds out of three.

Play against the bot, or send a friend a match link.

## How to play

1. Pick a house. Each house plays a fixed 23-card deck.
2. Both players draw **8** cards. The player who goes first gets **First Light**: +1 to their Round 1 total.
3. On your turn, do one thing:
   - **Play a card.** Drag it onto your Front or Back row, or click it and then click the row. Specials are cast straight away.
   - **Pass.** You're out for the rest of the round. Your opponent can keep playing.
4. When both players have passed, the higher total wins the round. A tie counts as a win for both.
5. The board clears between rounds. Each player draws **2** more cards (hand limit 10). The round's winner starts the next round.
6. Win two rounds to win the match.

Every card you spend is gone for the rest of the match. The skill is winning rounds cheaply, or letting a round go on purpose while your opponent overspends.

## The board

Each side has a **Front** row and a **Back** row, with up to 6 units in each. Any unit can go in either row. Where you put it matters:

- **Guard** only protects your Back row while the Guard unit sits in your Front row.
- **Rally** boosts only the row it's played into.
- **Echo** tokens appear in the row opposite the card that made them.
- Some cards hit a whole row at once, so stacking everything in one row is risky.

## Keywords

| Keyword | What it does |
| --- | --- |
| **Resolve** | Only triggers if your opponent has already passed this round. Hold these cards until they pass. |
| **Deploy** | Triggers once, when you play the card. |
| **Guard** | Protects your Back row. While a Guard unit sits in your Front row, the enemy cannot target anything in your Back row. Effects that hit "every" unit still get through. |
| **Shield** | A one-time block. The next time this unit would lose power (Burn, Poison, a Duel hit), it loses nothing and the Shield breaks. |
| **Poison** | Loses 1 power at the end of each of its owner’s turns, until it dies or the round ends. Stops ticking once its owner passes. |
| **Grow** | Gains 1 power at the end of each of your turns. Stops once you pass. |
| **Burn** | Deal that much damage to a unit. At 0 power it is destroyed. |
| **Rally** | When played, every other unit already in the same row gains that much power. |
| **Echo** | Summons a token with that power in your other row. Tokens count toward your score but vanish at the end of the round. |
| **Sacrifice** | Destroy one of your own units to pay for the effect. |
| **Duel** | This unit and the target take turns hitting each other for their current power, this unit first, until one is destroyed. |
| **Silence** | Removes Grow, Guard, Shield and Poison from a unit. |
| **Boost** | A unit gains that much power. |
| **Take control** | The enemy unit switches to your side of the board. |

## The four houses

### The Coven: Poison & Grow

Poison drains enemy units every turn they stay in; Grow builds yours. Wins long rounds.

| Card | Type | Power | Copies | Ability |
| --- | --- | --- | --- | --- |
| Mawroot *(the potted maw)* | Legend | 6 | 1 | Grow. Deploy: Poison an enemy unit. |
| Simmer *(the brew wraith)* | Legend | 4 | 1 | Deploy: Poison 2 enemy units. Resolve: Poison 3 instead. |
| Vespera *(bone-mask)* | Legend | 5 | 1 | Deploy: Every Poisoned enemy unit loses 2. |
| Grandmother Rot *(the mire hag)* | Legend | 4 | 1 | Deploy: Poison every enemy unit with 4 or less power in a row. |
| Hollow Bloom *(the greedy flower)* | Legend | 5 | 1 | Grow. Deploy: Your other Grow units gain 2. |
| Thornling | Unit | 2 | 3 | Grow. |
| Blight Moth | Unit | 2 | 3 | Deploy: Poison an enemy unit. |
| Bog Brute | Unit | 4 | 3 | — |
| Rootkeeper | Unit | 4 | 3 | Deploy: Give another allied unit Grow. |
| Mire Toad | Unit | 4 | 3 | Deploy: A Poisoned enemy unit loses 3. |
| Witch Brew | Special | — | 3 | Poison the 2 strongest enemy units in a row. |

### The Order: Shield, Guard & Rally

A tall Front row that removal can’t crack. Shield soaks hits, Guard hides your Back row.

| Card | Type | Power | Copies | Ability |
| --- | --- | --- | --- | --- |
| Ser Halden *(the white cross)* | Legend | 6 | 1 | Guard. Shield. |
| Kestra *(target-staff)* | Legend | 5 | 1 | Resolve: Boost all your units by 1. |
| The Warden *(shade-binder)* | Legend | 4 | 1 | Deploy: Silence an enemy unit, then it loses 2. |
| Captain Ilse *(the banner)* | Legend | 5 | 1 | Rally 2. Resolve: Give every unit in your Front row Shield. |
| Brother Aurel *(the lantern)* | Legend | 5 | 1 | Deploy: Give Shield to up to 2 allied units. |
| Shieldbearer | Unit | 5 | 3 | Guard. Shield. |
| Squire | Unit | 3 | 3 | Rally 2. Other units in this row gain 2. |
| Lancer | Unit | 6 | 3 | — |
| Chaplain | Unit | 3 | 3 | Deploy: Give another allied unit Shield and +1. |
| Crossbowman | Unit | 3 | 3 | Deploy: Burn 2. |
| Hold the Line | Special | — | 3 | Boost all your Front-row units by 2. |

### The Ember: Burn & Sacrifice

Burn removes their best unit; Sacrifice turns small units into big ones. Wins short rounds.

| Card | Type | Power | Copies | Ability |
| --- | --- | --- | --- | --- |
| Vorok *(hellhand)* | Legend | 6 | 1 | Deploy: Burn 4. Resolve: Burn 8 instead. |
| Skarr *(marrow king)* | Legend | 6 | 1 | Deploy: Sacrifice up to 2 of your units with 3 or less power. +3 for each. |
| Hue *(the motley devil)* | Legend | 5 | 1 | Deploy: Burn 1 to every enemy unit. |
| Matron Cinder *(the ash widow)* | Legend | 4 | 1 | Deploy: Burn 2 to up to 2 enemy units. |
| Gorehorn *(the stampede)* | Legend | 10 | 1 | Deploy: Every other unit in this row loses 2. |
| Cinder Imp | Unit | 2 | 3 | Deploy: Burn 2. |
| Pyre Hound | Unit | 6 | 3 | — |
| Ash Cultist | Unit | 3 | 3 | Deploy: You may Sacrifice a unit with 3 or less power; gain its power +2. |
| Brimstone Ogre | Unit | 8 | 3 | Deploy: Burn 3 to your strongest other unit. |
| Ember Whelp | Unit | 2 | 3 | Echo 2. Summon a 2-power Spark in your other row. |
| Hellfire | Special | — | 3 | Choose: Burn 5, or Burn 2 to every enemy unit in a row. |

### The Echo: Echo & Disrupt

Floods both rows with tokens, then steals and shoves enemy units. Too wide to Burn down.

| Card | Type | Power | Copies | Ability |
| --- | --- | --- | --- | --- |
| Null-9 *(masked relay)* | Legend | 5 | 1 | Deploy: Take control of an enemy unit with 4 or less power. |
| Drake-07 *(drill drake)* | Legend | 3 | 1 | Deploy: Summon two Echo 3 in your Front row. |
| Aiden *(iron-hand)* | Legend | 6 | 1 | Deploy: Duel an enemy unit. Resolve: Aiden gains +3 first. |
| Mirrorjack *(the copycat)* | Legend | 3 | 1 | Deploy: Choose an enemy unit. If it has more power, this becomes its power. |
| Lattice *(the swarm mother)* | Legend | 4 | 1 | Deploy: Your Echo tokens gain 2. |
| Glitch Rat | Unit | 2 | 3 | Echo 3. Summon a 3-power token in your other row. |
| Static Runner | Unit | 4 | 3 | Echo 2. Summon a 2-power token in your other row. |
| Relay Drone | Unit | 3 | 3 | Deploy: Move an enemy unit to its other row; it loses 2. |
| Patchwork | Unit | 6 | 3 | — |
| Signal Ghost | Unit | 2 | 3 | Resolve: Summon a 4-power Echo in your other row. |
| Afterimage | Special | — | 3 | Copy your strongest unit as an Echo in its other row. |

## Card art

Legends without finished art show their house symbol and **ART PENDING**: Grandmother Rot, Hollow Bloom, Captain Ilse, Brother Aurel, Matron Cinder, Gorehorn, Mirrorjack and Lattice. Common cards use their house symbol.
