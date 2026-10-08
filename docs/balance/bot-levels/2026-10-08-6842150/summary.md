# Bot ladder 2026-10-08 (6842150)

Seed 20261008, 448 games asked per pairing, 9 worker(s). Draws count half. Intervals are 95% Wilson.

## Criterion 3

| Criterion | Score | CI lower bound | Result |
| --- | --- | --- | --- |
| c3-hard-medium | 89.7% | 86.6% | PASS |
| c3-medium-easy | 67.3% | 62.8% | PASS |
| c3-easy-random | 79.2% | 75.2% | FAIL |

## Pairings

| Pairing | A | B | Games | Errors | Guards | A wins | B wins | Draws | A score | 95% CI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| easy-random | easy:heur-easy-1 | random:uniform-1 | 448 | 0 | 65 | 350 | 88 | 10 | 79.2% | 75.2% - 82.7% |
| hard-easy | hard:mcts-1@160 | easy:heur-easy-1 | 448 | 0 | 0 | 302 | 140 | 6 | 68.1% | 63.6% - 72.2% |
| hard-medium | hard:mcts-1@160 | medium:heur-2 | 448 | 0 | 0 | 400 | 44 | 4 | 89.7% | 86.6% - 92.2% |
| hard-random | hard:mcts-1@160 | random:uniform-1 | 448 | 0 | 18 | 411 | 37 | 0 | 91.7% | 88.8% - 93.9% |
| medium-easy | medium:heur-2 | easy:heur-easy-1 | 448 | 0 | 0 | 292 | 137 | 19 | 67.3% | 62.8% - 71.5% |
| medium-random | medium:heur-2 | random:uniform-1 | 448 | 0 | 17 | 421 | 25 | 2 | 94.2% | 91.6% - 96.0% |

## A's score by seat and first player

| Pairing | A in seat 0 | A in seat 1 | A moves first | B moves first |
| --- | --- | --- | --- | --- |
| easy-random | 78.8% | 79.7% | 75.9% | 82.6% |
| hard-easy | 67.2% | 69.0% | 63.2% | 73.0% |
| hard-medium | 90.2% | 89.3% | 89.5% | 90.0% |
| hard-random | 89.7% | 93.8% | 89.3% | 94.2% |
| medium-easy | 68.3% | 66.3% | 65.4% | 69.2% |
| medium-random | 94.2% | 94.2% | 95.8% | 92.6% |

## A's score by house pair (A > B)

**easy-random**

| House pair | Games | A score |
| --- | --- | --- |
| COVEN>COVEN | 28 | 80% |
| COVEN>ECHO | 28 | 64% |
| COVEN>EMBER | 28 | 82% |
| COVEN>ORDER | 28 | 66% |
| ECHO>COVEN | 28 | 88% |
| ECHO>ECHO | 28 | 79% |
| ECHO>EMBER | 28 | 82% |
| ECHO>ORDER | 28 | 82% |
| EMBER>COVEN | 28 | 89% |
| EMBER>ECHO | 28 | 73% |
| EMBER>EMBER | 28 | 89% |
| EMBER>ORDER | 28 | 64% |
| ORDER>COVEN | 28 | 82% |
| ORDER>ECHO | 28 | 71% |
| ORDER>EMBER | 28 | 86% |
| ORDER>ORDER | 28 | 89% |

**hard-easy**

| House pair | Games | A score |
| --- | --- | --- |
| COVEN>COVEN | 28 | 48% |
| COVEN>ECHO | 28 | 46% |
| COVEN>EMBER | 28 | 64% |
| COVEN>ORDER | 28 | 79% |
| ECHO>COVEN | 28 | 54% |
| ECHO>ECHO | 28 | 70% |
| ECHO>EMBER | 28 | 48% |
| ECHO>ORDER | 28 | 71% |
| EMBER>COVEN | 28 | 61% |
| EMBER>ECHO | 28 | 86% |
| EMBER>EMBER | 28 | 75% |
| EMBER>ORDER | 28 | 86% |
| ORDER>COVEN | 28 | 64% |
| ORDER>ECHO | 28 | 79% |
| ORDER>EMBER | 28 | 86% |
| ORDER>ORDER | 28 | 73% |

**hard-medium**

| House pair | Games | A score |
| --- | --- | --- |
| COVEN>COVEN | 28 | 93% |
| COVEN>ECHO | 28 | 100% |
| COVEN>EMBER | 28 | 82% |
| COVEN>ORDER | 28 | 86% |
| ECHO>COVEN | 28 | 100% |
| ECHO>ECHO | 28 | 86% |
| ECHO>EMBER | 28 | 66% |
| ECHO>ORDER | 28 | 91% |
| EMBER>COVEN | 28 | 96% |
| EMBER>ECHO | 28 | 93% |
| EMBER>EMBER | 28 | 96% |
| EMBER>ORDER | 28 | 82% |
| ORDER>COVEN | 28 | 91% |
| ORDER>ECHO | 28 | 96% |
| ORDER>EMBER | 28 | 93% |
| ORDER>ORDER | 28 | 84% |

**hard-random**

| House pair | Games | A score |
| --- | --- | --- |
| COVEN>COVEN | 28 | 100% |
| COVEN>ECHO | 28 | 82% |
| COVEN>EMBER | 28 | 89% |
| COVEN>ORDER | 28 | 89% |
| ECHO>COVEN | 28 | 93% |
| ECHO>ECHO | 28 | 100% |
| ECHO>EMBER | 28 | 100% |
| ECHO>ORDER | 28 | 100% |
| EMBER>COVEN | 28 | 96% |
| EMBER>ECHO | 28 | 96% |
| EMBER>EMBER | 28 | 86% |
| EMBER>ORDER | 28 | 89% |
| ORDER>COVEN | 28 | 89% |
| ORDER>ECHO | 28 | 82% |
| ORDER>EMBER | 28 | 82% |
| ORDER>ORDER | 28 | 93% |

**medium-easy**

| House pair | Games | A score |
| --- | --- | --- |
| COVEN>COVEN | 28 | 68% |
| COVEN>ECHO | 28 | 43% |
| COVEN>EMBER | 28 | 43% |
| COVEN>ORDER | 28 | 39% |
| ECHO>COVEN | 28 | 88% |
| ECHO>ECHO | 28 | 55% |
| ECHO>EMBER | 28 | 59% |
| ECHO>ORDER | 28 | 80% |
| EMBER>COVEN | 28 | 88% |
| EMBER>ECHO | 28 | 80% |
| EMBER>EMBER | 28 | 91% |
| EMBER>ORDER | 28 | 79% |
| ORDER>COVEN | 28 | 82% |
| ORDER>ECHO | 28 | 50% |
| ORDER>EMBER | 28 | 75% |
| ORDER>ORDER | 28 | 57% |

**medium-random**

| House pair | Games | A score |
| --- | --- | --- |
| COVEN>COVEN | 28 | 100% |
| COVEN>ECHO | 28 | 82% |
| COVEN>EMBER | 28 | 93% |
| COVEN>ORDER | 28 | 75% |
| ECHO>COVEN | 28 | 100% |
| ECHO>ECHO | 28 | 96% |
| ECHO>EMBER | 28 | 96% |
| ECHO>ORDER | 28 | 98% |
| EMBER>COVEN | 28 | 100% |
| EMBER>ECHO | 28 | 91% |
| EMBER>EMBER | 28 | 96% |
| EMBER>ORDER | 28 | 100% |
| ORDER>COVEN | 28 | 96% |
| ORDER>ECHO | 28 | 93% |
| ORDER>EMBER | 28 | 100% |
| ORDER>ORDER | 28 | 89% |

## How the matches went

| Pairing | 2-0 | 2-1 | With a tied round | Round 1 winner won the match | A won R1 | A won R2 | A won R3 | Cards left (A / B) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| easy-random | 31% | 67% | 6% | 63% | 54% | 63% | 77% | 3.3 / 1.3 |
| hard-easy | 23% | 75% | 4% | 48% | 21% | 58% | 86% | 2.3 / 1.5 |
| hard-medium | 6% | 93% | 5% | 43% | 38% | 63% | 89% | 1.3 / 0.4 |
| hard-random | 10% | 90% | 2% | 37% | 29% | 65% | 100% | 5.1 / 1.3 |
| medium-easy | 12% | 84% | 8% | 43% | 20% | 70% | 72% | 1.2 / 0.7 |
| medium-random | 5% | 95% | 4% | 35% | 31% | 67% | 96% | 4.6 / 1.3 |

## Passing (rounds 1 / 2 / 3)

| Pairing | Bot | Passed first | Hand at pass | Plays before pass |
| --- | --- | --- | --- | --- |
| easy-random | easy:heur-easy-1 | 52% / 42% / 40% | 5.0 / 4.5 / 4.6 | 3.2 / 2.7 / 2.4 |
| easy-random | random:uniform-1 | 39% / 42% / 46% | 3.8 / 2.6 / 2.1 | 4.4 / 2.8 / 1.3 |
| hard-easy | hard:mcts-1@160 | 78% / 63% / 53% | 5.9 / 4.6 / 2.4 | 2.3 / 3.4 / 4.3 |
| hard-easy | easy:heur-easy-1 | 19% / 30% / 16% | 5.6 / 5.3 / 4.4 | 2.6 / 3.0 / 4.1 |
| hard-medium | hard:mcts-1@160 | 83% / 39% / 61% | 5.9 / 6.6 / 2.0 | 2.3 / 1.4 / 7.0 |
| hard-medium | medium:heur-2 | 15% / 58% / 4% | 5.5 / 6.7 / 2.8 | 2.7 / 0.8 / 6.9 |
| hard-random | hard:mcts-1@160 | 79% / 60% / 42% | 5.9 / 5.9 / 5.2 | 2.3 / 2.0 / 2.9 |
| hard-random | random:uniform-1 | 20% / 40% / 56% | 3.9 / 2.6 / 2.2 | 4.3 / 2.6 / 1.7 |
| medium-easy | medium:heur-2 | 65% / 58% / 46% | 5.1 / 4.1 / 2.4 | 3.1 / 3.5 / 4.0 |
| medium-easy | easy:heur-easy-1 | 31% / 25% / 22% | 4.7 / 5.5 / 3.6 | 3.5 / 2.0 / 4.6 |
| medium-random | medium:heur-2 | 73% / 55% / 41% | 5.2 / 5.6 / 5.0 | 3.0 / 1.6 / 2.9 |
| medium-random | random:uniform-1 | 26% / 42% / 54% | 3.8 / 2.6 / 2.4 | 4.5 / 2.6 / 1.7 |

## Think time per decision (ms)

| Bot | Decisions | p50 | p95 | Max | Mean |
| --- | --- | --- | --- | --- | --- |
| easy:heur-easy-1 | 16150 | 0.4 | 1.1 | 4.0 | 0.5 |
| hard:mcts-1@160 | 16087 | 928.2 | 2186.7 | 3559.5 | 1005.9 |
| medium:heur-2 | 16855 | 0.4 | 1.2 | 21.2 | 0.5 |
| random:uniform-1 | 16892 | 0.1 | 0.1 | 3.0 | 0.1 |
