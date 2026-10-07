---
name: debate
description: Structured decision-making for AFTERLIGHT - a proposal is attacked by the red team, rebutted once, and decided against a rubric, with the result recorded as an ADR. Use when Aiden says /debate or faces a design, product or architecture choice with real trade-offs.
argument-hint: <the question to decide>
disable-model-invocation: true
---
Question: $ARGUMENTS

Run this fixed protocol, not open-ended chat between agents: copies of the same model converge politely.

1. Frame (you): state the decision in one sentence, why now, the constraints (CLAUDE.md invariants, the backlog's P0s, Aiden's goals), and what "reversible" means here.
2. Proposal: architect for technical questions, product-strategist for product questions, game-designer for rules and balance. Ask for 2-3 real options with evidence, plus a recommendation.
3. Attack - red-team. Its brief: break the recommendation and argue for the strongest alternative as its best advocate would.
4. Rebuttal: the proposer answers each objection once: concede and change, or reject with evidence. No second round.
5. Decide (you): score each surviving option 1-5 on player impact, risk, effort, reversibility and fit with the invariants. Show the scores. Pick one, and name the condition that would make you revisit it.
6. Record: docs/decisions/NNNN-<slug>.md from the template, with the options, the objections that mattered, and the decision.
7. Aiden has the final say on anything irreversible or costing more than about 3 days. Present: the decision, the runner-up, and the one risk Aiden is accepting.
