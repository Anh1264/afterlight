---
name: ship
description: Run one AFTERLIGHT backlog item or feature through the full delivery pipeline - spec, design, red-team, tests first, build, verify, review, PR - using the agents in .claude/agents. Use when Aiden says /ship or asks to build or ship a feature.
argument-hint: <backlog id or feature description>
disable-model-invocation: true
---
You are the orchestrator for this item: $ARGUMENTS

Route work to the agents, run the gates yourself, and spend Aiden's attention only at the two human gates. After each step, give Aiden one status line: step, owner, result, next.

## 0. Size it
Read docs/backlog.md and the relevant code. Size the item (CLAUDE.md "Sizing") and tell Aiden why in one line.
- S -> stop and run the /bug pipeline instead.
- L -> run steps 1-3 for the epic, propose the split into M items, wait for Aiden, then /ship each M.

## 1. Spec - product-strategist
Give it the item and any context Aiden gave you.
Gate: 3-8 testable acceptance criteria, an out-of-scope list, behaviour at both viewports for UI work.

## 2. Design - architect
Give it the spec path.
Gate: files with owners, exact interface changes, test plan, parallel work split.

## 3. Challenge - red-team
Give it the spec path. Send its objections back to architect for exactly one response each: accept (and update the design) or reject (with a reason).
You decide what's unresolved. A hard-to-reverse decision gets an ADR in docs/decisions/.

## HUMAN GATE 1
Show Aiden: the player problem, the acceptance criteria, the design in 5 lines, the red-team's top 3 objections and how each was handled, and the size. If visuals help (a flow, a mockup, the screen today), publish them as an artifact. Wait for an explicit "go".

## 4. Branch
`feat/<id>-<slug>` (CLAUDE.md "Git"). If another item is already in flight in this checkout, stop and ask Aiden to start this one in a new worktree session (CLAUDE.md "Git"). Tell every later agent which directory to work in.

## 5. Tests first - qa-engineer
Give it the spec path ONLY (not the design rationale).
Gate: run the tests yourself and confirm each fails for the right reason. Don't commit yet: the commit hook requires green.

## 6. Build - engine-dev / server-dev / client-dev
Give each the spec path, the test files, its slice of the work split and the working directory. Run devs in parallel only when the design says their files don't overlap.
Gate: `npm run check` green and the new tests pass. Failures follow the CLAUDE.md escalation rule; a disputed test goes to qa-engineer.

## 7. Verify - you, deterministically
Run `npm run check` and `npm run e2e`. Client changes: ux-reviewer on the affected flow. Any Blocker or Major goes back to step 6.

## 8. Review - code-reviewer
Give it the spec path and the branch. CHANGES -> send the blocking list back to the dev (step 6), then re-review. At most 2 review cycles; then escalate to Aiden.

## 9. PR
Commit with a conventional message (the hook reruns the gate), push the branch, `gh pr create`. The PR body holds: spec link, the criterion -> test table, `npm run check` output, screenshots for UI, risks, and any step you skipped and why. Update the item's status in docs/backlog.md.

## HUMAN GATE 2
Aiden reviews and merges the PR (merge = deploy). Never merge yourself.
