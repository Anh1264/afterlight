# AFTERLIGHT - engineering manual

Online Gwent-style card game: best of 3 rounds, 4 houses + Neutral, PvP by share-link plus a bot opponent. Owner: Aiden Vu. Live on Railway; every merge to `main` deploys.

## Stack and layout
- TypeScript everywhere (strict). Node 20+.
- `shared/` - the rules engine (pure, seeded, deterministic), cards and effects, bot, simulator, protocol types. Imported by server AND client.
- `server/` - Express (serves the built client and art) + Socket.IO. Authoritative: it owns every GameState.
- `client/` - React 19 + Vite + framer-motion. `director.ts` replays server event batches as animations.
- `docs/` - specs, decisions (ADRs), backlog, art briefs, balance reports.
- `e2e/` - Playwright tests (`*.spec.ts`, shared steps in `e2e/helpers.ts`). `e2e/out/` holds screenshots and reports and is gitignored.

## Commands
- `npm run dev` - server :3001 + client :5173 (also registered as the Code tab preview in .claude/launch.json)
- `npm run check` - typecheck + tests. THE gate: a commit is blocked if this fails (.claude/hooks/guard-bash.mjs).
- `npm test` - vitest: engine tests + a fuzz-lite pass. `npm run sim -- 200` - full fuzz + bot-vs-bot balance matrix.
- `npm run e2e` - Playwright smoke: builds the client, starts the server on :3101 and plays a bot match to the end. `E2E_BASE_URL=<url>` runs it against another host instead. First time on a machine: `npx playwright install chromium`.
- CI (.github/workflows/ci.yml): check + build + audit on every PR and every push to main; e2e on PRs only.
- `npm run build` / `npm start` - what Railway runs.

## Invariants (never break these; reviewers block on them)
1. The engine is pure and deterministic: same (seed, decks, first, actions) gives the same events. No I/O, Date or Math.random inside shared/engine.
2. The server is authoritative. Clients send intents (actions), never state. Every socket payload is validated before use (backlog P0-1).
3. The client never re-derives a rule number. Totals, legality, targeting and constants come from shared/. (Cautionary tale: First Light +1 was once hard-coded in Game.tsx.)
4. The server never knows animation timings.
5. Card rules text describes exactly what the engine does.
6. Hidden information never leaves the server: opponent hand, deck order, RNG seed.

## Conventions
- No `any`, no non-null assertions and no silent `catch {}` in new code.
- README.md describes the game only (rules, keywords, card lists). No dev or deploy instructions there.
- Don't commit generated or local files: node_modules, dist, e2e/out, client/public/art/manifest.json.
- Art: drop `client/public/art/<card-id>.png|webp|jpg` (transparent, about 800x1200). Placeholders until Aiden supplies art; never generate card art.

## Git and release
- Never push `main`, never force-push (a hook blocks both). Work on `<type>/<id>-<slug>` branches (feat/, fix/, chore/, test/) cut from a freshly fetched `origin/main`; local `main` lags.
- Finish with a PR: `gh pr create`. If `gh` isn't available, push the branch and give Aiden the GitHub compare URL.
- Aiden merges. Merge to main = deploy.
- Parallel work uses worktrees. In the desktop Code tab, start a new session (Cmd+N) on a new branch with the worktree box ticked; the app keeps it in `.claude/worktrees/`. Run `npm ci` inside a new worktree before testing.

## The team (.claude/agents)
The main session is the orchestrator: it routes work, runs the gates, and talks to Aiden. It does not write production code itself when a pipeline is running.

| Agent | Model | Use it for |
| --- | --- | --- |
| product-strategist | opus | Spec: player problem, acceptance criteria, scope cuts, metric |
| architect | opus | Design, ADRs, hard root-causes, refactor plans (the CTO role) |
| red-team | opus | Attacks specs, designs and ideas. Cannot approve |
| game-designer | opus | Cards, keywords, balance with confidence intervals |
| qa-engineer | sonnet | Failing tests from acceptance criteria, before the code |
| engine-dev | sonnet | shared/ |
| server-dev | sonnet | server/, protocol |
| client-dev | sonnet | client/ |
| code-reviewer | opus | Fresh-eyes diff review, APPROVE or CHANGES |
| ux-reviewer | opus | Plays the game in Playwright at desktop + phone, screenshots, ranks issues |

Escalation: if a sonnet developer fails the gate twice on the same task, rerun that task with the model overridden to opus. If opus also fails, stop and report to Aiden.

## Sizing
- S: a bug, or under ~50 lines in one area, no protocol or data change. Pipeline: /bug.
- M: a feature in 1-2 areas. Pipeline: /ship (full).
- L: touches protocol, persistence, the effect system, or 3 areas. Split into M items first; the epic gets spec + design + /debate.

## Pipelines (.claude/skills)
- `/ship <item>` - spec -> design -> red-team -> HUMAN GATE 1 -> tests first -> build -> verify -> review -> PR -> HUMAN GATE 2 (merge).
- `/bug <description>` - reproduce as a failing test -> root cause -> fix -> verify -> review -> PR.
- `/debate <question>` - proposal vs red-team, one rebuttal, decision recorded as an ADR.
- `/ux-pass [flow]` - ux-reviewer audit, issues filed to the backlog.

## Definition of done
- Every acceptance criterion has a test that fails without the change.
- `npm run check` and `npm run e2e` are green.
- code-reviewer verdict is APPROVE. For client changes, ux-reviewer screenshots at both sizes are attached.
- docs/backlog.md status updated; README card tables regenerated if cards changed.

## Where things are
- Backlog and known issues: docs/backlog.md (seeded from the Oct 2026 CTO review).
- Specs: docs/specs/. Decisions: docs/decisions/. Balance reports: docs/balance/.
