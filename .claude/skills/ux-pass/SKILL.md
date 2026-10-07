---
name: ux-pass
description: Run a UX/UI audit of AFTERLIGHT in a real browser at desktop and phone sizes and file the findings to the backlog. Use when Aiden says /ux-pass or asks to review the look, feel or usability of a screen or flow.
argument-hint: "[flow or screen, default: all core flows]"
disable-model-invocation: true
---
Scope: $ARGUMENTS (if empty: the default flows listed in ux-reviewer).

1. Run ux-reviewer on the scope.
2. De-duplicate against docs/backlog.md. Each new Blocker or Major becomes a backlog item: area, size, one-line player impact, screenshot path.
3. Show Aiden the top 5 issues with their screenshots (take Minors from REPORT.md if there are fewer than 5 Blockers and Majors). Open the screenshots or REPORT.md in the browser pane, or publish an artifact that lays the screenshots side by side.
4. Ask which ones to send to /bug or /ship. Don't start fixing until Aiden picks.
