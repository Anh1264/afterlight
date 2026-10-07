# AFTERLIGHT - engineering manual

Online Gwent-style card game: best of 3 rounds, 4 houses + Neutral, PvP by share-link plus a bot. Owner: Aiden Vu. Railway deploys every merge to `main`.

## Layout
- TypeScript strict, Node 20+.
- `shared/` - pure, seeded rules engine; cards, effects, bot, simulator, protocol types. Imported by server and client.
- `server/` - Express (serves client + art) + Socket.IO; owns every GameState.
- `client/` - React 19 + Vite + framer-motion; `director.ts` replays server event batches as animations.
- `e2e/` - Playwright `*.spec.ts`, steps in `helpers.ts`; output in `e2e/out/` (gitignored).
- `docs/` - backlog.md, specs/, decisions/ (ADRs), balance/, art-briefs.md. New specs and ADRs copy their folder's `_template.md`.

## Commands
- `npm run dev` - server :3001 + client :5173 (preview: .claude/launch.json).
- `npm test` - vitest + fuzz-lite. `npm run check` - typecheck + tests; the commit hook (.claude/hooks/guard-bash.mjs) blocks commits while it fails.
- `npm run e2e` - builds, serves on :3101, plays a bot match. `E2E_BASE_URL=<url>` targets another host; first run on a machine needs `npx playwright install chromium`.
- `npm run sim -- 200` - full fuzz + bot-vs-bot balance matrix.
- `npm run build` / `npm start` - what Railway runs. CI (.github/workflows/ci.yml): check + build + audit on PRs and pushes to main; e2e on PRs.

## Invariants (reviewers block on these)
1. Engine is pure and deterministic: same (seed, decks, first, actions) -> same events. No I/O, Date or Math.random in shared/engine.
2. Server is authoritative: clients send intents (actions), never state; every socket payload is validated before use.
3. Client never re-derives a rule number: totals, legality, targeting and constants come from shared/ (cautionary tale: First Light +1 once hard-coded in Game.tsx).
4. Server never knows animation timings.
5. Card rules text describes exactly what the engine does.
6. Hidden information never leaves the server: opponent hand, deck order, RNG seed.

## Conventions
- New code: no `any`, no non-null assertions, no silent `catch {}`.
- "Both viewports" = desktop 1440x900 + phone landscape 844x390.
- README.md is game info only (rules, keywords, card lists); no dev or deploy docs.
- Never commit node_modules, dist, e2e/out, client/public/art/manifest.json.
- Never generate card art; placeholders until Aiden supplies it (drop path: client/CLAUDE.md).

## Git
- Branch: `git fetch origin && git switch -c <type>/<id>-<slug> origin/main --no-track` (types feat/fix/chore/test; local `main` lags).
- Never push `main`, never force-push (hook-enforced).
- Finish with `gh pr create` (no `gh`: push and give Aiden the compare URL). Aiden merges; merge = deploy.
- Parallel work: new desktop session (Cmd+N) with the worktree box ticked (.claude/worktrees/); `npm ci` there first.

## Team (.claude/agents) and pipelines (.claude/skills)
- Main session = orchestrator: routes work, runs gates, talks to Aiden; writes no production code while a pipeline runs. Only it commits or pushes.
- Subagents return conclusions with file:line in their agent file's return format, never file contents or raw logs.
- Devs (engine-, server-, client-dev) never edit qa-engineer's tests. A dev who disputes one names the assertion and reason, then stops; qa-engineer rules.
- Escalation: a sonnet dev fails the gate twice on a task -> rerun on opus -> fails again -> stop and report to Aiden with the failing output.
- Sizing: S (a bug, or <~50 lines in one area, no protocol/data change) -> /bug. M (feature in 1-2 areas) -> /ship. L (protocol, persistence, effect system, or 3 areas) -> split into M; the epic gets spec + design + /debate.
- Aiden invokes /ship, /bug, /debate (decision -> ADR), /ux-pass (audit -> backlog).

## Definition of done
- Every acceptance criterion has a test that fails without the change.
- `npm run check` and `npm run e2e` green.
- code-reviewer APPROVE; client changes attach ux-reviewer screenshots at both viewports.
- docs/backlog.md status updated; README card tables regenerated if cards changed.
