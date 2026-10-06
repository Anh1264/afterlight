---
name: bug
description: Fix an AFTERLIGHT bug the professional way - reproduce it as a failing test first, root-cause it, fix it, verify, review, open a PR. Use when Aiden says /bug or reports something broken.
argument-hint: <what's broken, and how to trigger it>
disable-model-invocation: true
---
You are the orchestrator for this bug: $ARGUMENTS

1. Triage (you). Restate the bug as expected vs actual, with exact repro steps. Find the likely area (shared / server / client). If it's actually a feature or bigger than S, say so and switch to /ship. Add it to docs/backlog.md if it isn't there.
2. Branch: `git switch -c fix/<id>-<slug>`.
3. Reproduce - qa-engineer. Give it the bug report only. Output: a test that fails because of the bug (unit for rules, Playwright for UI and navigation). Confirm the failure yourself. For a UI bug, also have ux-reviewer capture before-screenshots at 1440x900 and 844x390.
4. Root cause - the area's developer (engine-dev, server-dev or client-dev). It must state the cause in 1-3 sentences with file:line BEFORE changing anything. Check the cause explains every symptom. If it doesn't, or the bug is in a hard area (sync, reconnection, determinism), use architect for the root cause instead.
5. Fix - same developer. The gate is `npm run check` green with the repro test passing. Devs never edit the repro test. The escalation rule is the same as /ship: two fails -> opus -> Aiden.
6. Look for siblings: grep for the same pattern elsewhere (the same mistake usually exists twice). Fix or file each one.
7. Review - code-reviewer on the branch. UI bugs: ux-reviewer after-screenshots at both sizes.
8. PR: commit, push the branch, `gh pr create`. The body gives the root cause, the fix, the repro test, before/after screenshots, and the siblings found. Update docs/backlog.md. Aiden merges.
