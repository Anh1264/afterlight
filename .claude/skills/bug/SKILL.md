---
name: bug
description: Fix an AFTERLIGHT bug the fast, professional way - size it, reproduce it as a failing test, fix it, review and UX-check in parallel, open a PR. Use when Aiden says /bug or reports something broken.
argument-hint: <what's broken, and how to trigger it>
disable-model-invocation: true
---
You are the orchestrator for this bug: $ARGUMENTS
Target for an S bug: about 45 minutes and 10M tokens end to end. Give Aiden one status line per step.

0. Session: this must be a fresh worktree session with no other item in it (CLAUDE.md "Team"). If it isn't, stop and ask Aiden to start one.
1. Triage (you). Restate the bug as expected vs actual, with exact repro steps, and find the area (shared / server / client). Size it (CLAUDE.md "Sizing") and say why in one line:
   - First read the failing line and what it calls, and name a hypothesis; pass it to the dev.
   - Still unknown -> run one capped investigation first (the area's dev, or architect for sync, reconnection or determinism): cause with file:line, then size.
   - M or L -> stop and switch to /ship.
   - S -> continue. Add it to docs/backlog.md if it isn't there.
2. Branch: `fix/<id>-<slug>` (CLAUDE.md "Git").
3. Repro and fix - one dev of the area (engine-dev, server-dev or client-dev; Sonnet, xhigh), given the bug report, the size and the working directory. In this order:
   1. Write the repro test (unit for rules, Playwright for UI and navigation; for a UI bug, also cover arriving by direct URL and reload) and run it: it must fail for the bug's reason. Report that output.
   2. State the cause in 1-3 sentences with file:line, and check it explains every symptom.
   3. Fix, then grep for the same mistake elsewhere: fix it if it's in the same area and S, otherwise list it.
   4. Gate: `npm run check` green, plus the affected e2e specs (not the full suite).
   Cap: 15 minutes. Proof: `--repeat-each 10` for a flake, no load testing unless the repro needs it. It stops and reports if the fix reaches an L surface or outgrows S. Failures follow the CLAUDE.md escalation rule.
4. Verify - you: re-run `npm run check` and the affected specs. Don't re-read files the dev already summarized.
5. Review, in parallel (one message, two agents), both with `model: sonnet` and told "size S":
   - code-reviewer on the branch. It reverts the fix once to prove the repro test fails.
   - ux-reviewer, for user-visible bugs only: the changed screen at both viewports, arriving by direct URL as well as by click, at most 6 screenshots.
   CHANGES -> back to the dev, then a delta review (cycle 2 covers only what changed). At most 2 cycles; then escalate to Aiden.
6. PR: commit, push the branch, `gh pr create`. The body states the size, the cause, the fix, the repro test and its pre-fix failure, the screenshots, the siblings found, and the reviewer's "Enforce mechanically" line. File each sibling and enforcement item in docs/backlog.md and update the bug's status. Aiden merges; the session ends here.
