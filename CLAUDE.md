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
- `npm run e2e` - builds, serves on :3101, plays a bot match. `E2E_BASE_URL=<url>` targets another host; first run on a machine needs `npx playwright install chromium`. One Playwright run per checkout at a time (runs share e2e/out/results); otherwise give each its own `E2E_PORT` and `--output`.
- `npm run sim -- 200` - full fuzz + bot-vs-bot balance matrix.
- `npm run build` / `npm start` - what Railway runs. CI (.github/workflows/ci.yml): check + build + audit on PRs and pushes to main; e2e on PRs.

## How we work
1. Hard checks beat written rules. A rule that can fail CI should; this file, skills and reviews are the soft layer.
2. A repeated comment is a missing check. When a reviewer or Aiden says the same thing twice, file a lint rule, test or CI check, not another reminder.
3. Make the shortest path the right path. Agents copy the nearest pattern, so the easy way must be the correct way: types that won't compile when a case is missed, one helper per job.
4. Verification needs a map. UI checks reach every screen the way a player can: by click, direct URL, reload and Back/Forward.
5. Effort scales with size (see Sizing). Short-lived contexts: one fresh session per item.
6. Autonomy is earned. The human gates stay; no auto-merge.

## Invariants (reviewers block on these; one marked (CI) is enforced by a check, so reviewers skip it)
1. Engine is pure and deterministic: same (seed, decks, first, actions) -> same events. No I/O, Date or Math.random in shared/engine.
2. Server is authoritative: clients send intents (actions), never state; every socket payload is validated before use.
3. Client never re-derives a rule number: totals, legality, targeting and constants come from shared/ (cautionary tale: First Light +1 once hard-coded in Game.tsx).
4. Server never knows animation timings.
5. Card rules text describes exactly what the engine does.
6. Hidden information never leaves the server: opponent hand, deck order, RNG seed.

## Conventions
- New code: no `any`, no non-null assertions, no silent `catch {}`.
- Desktop only. "Both viewports" = 1440x900 + small laptop 1366x650. Phones only need the "made for desktop" screen (phone.spec.ts).
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
- One item per session: each /bug or /ship runs in its own fresh worktree session, which ends once the PR is open. The orchestrator never carries two items, trusts agent returns, and re-runs only the gates.
- A failure Aiden reports gets its fix started in the same reply, never parked in the backlog first.
- Before calling a cause "unknown", read the failing line and what it calls and name a hypothesis; only if that finds nothing is it an investigation.
- S brief default: 15-minute cap; proof is `--repeat-each 10` plus one revert-the-fix check; no load testing unless the repro needs it.
- Talk to Aiden tersely: facts, numbers, links, next action. No restating.
- Subagents return conclusions with file:line in their agent file's return format, never file contents or raw logs.
- Devs (engine-, server-, client-dev) never edit qa-engineer's tests. A dev who disputes one names the assertion and reason, then stops; qa-engineer rules. Exception: in /bug (S) the dev writes the repro test first, and the reviewer proves it fails without the fix.
- Any agent that finds its work reaching an L surface (below), or outgrowing its size, stops and reports; the orchestrator re-sizes.
- Models: Sonnet writes all code, production and tests (engine-, server-, client-dev and qa-engineer, at xhigh effort). Opus thinks, verifies and oversees (product-strategist, architect, red-team, game-designer, code-reviewer, ux-reviewer). Never hand a coding task to Opus. One exception: for S items, code-reviewer and ux-reviewer run on Sonnet (pass `model: sonnet`).
- Parallel devs: tasks whose files don't overlap run as separate dev instances at once, each given these rules, its slice and its working directory.
- Escalation: a dev fails the gate twice on a task -> architect root-causes it and writes a fix plan with file:line -> a fresh dev of the same type implements it -> fails again -> stop and report to Aiden with the failing output.
- Sizing by risk and open decisions, not lines. Take the highest level that matches, and state it in the PR and in every reviewer prompt:
  - Unknown cause or unknown correct behaviour -> not an item yet: one capped investigation (a dev or architect, one run) whose output is a sized item.
  - L if any: changes shared/protocol.ts or socket messages, persistence or data shape, the effect system or core rules, or the hidden-information path; touches shared + server + client; can't be cleanly reverted after deploy. -> split into M; the epic gets spec + design + /debate.
  - M if any: someone must decide what "correct" looks like; a new screen or flow; a card or balance change; two areas; more than ~150 lines. -> /ship.
  - S only if all: correct behaviour already defined (a bug against the spec, or Aiden's words); one area; no invariant surface; one test reproduces it; a revert undoes it. -> /bug.
- Aiden invokes /ship, /bug, /debate (decision -> ADR), /ux-pass (audit -> backlog).

## Definition of done
- Every acceptance criterion has a test that fails without the change.
- `npm run check` green. e2e: M/L run `npm run e2e` locally; S runs only the affected specs locally and relies on CI for the full suite.
- code-reviewer APPROVE; client changes attach ux-reviewer screenshots at both viewports.
- Each "Enforce mechanically" line from review is filed in docs/backlog.md as a tooling item.
- docs/backlog.md status updated; README card tables regenerated if cards changed.
