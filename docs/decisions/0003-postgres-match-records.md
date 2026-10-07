# 0003 - Postgres on Railway, one record per match (inputs + facts), and a signed anonymous player key

Date: 2026-10-07    Status: proposed, revision 2 (after red-team round 1 and the orchestrator's rulings)    Deciders: Aiden + architect, red-team, orchestrator

## Context
docs/specs/data-platform.md needs durable storage for:
- match history;
- card stats that survive card changes;
- the inputs a future trained bot is evaluated on.

collection-v1.md keeps decks in the browser and needs an anonymous player id. Today nothing persists: one in-memory `rooms` Map (server/app.ts:142) and two log lines per match.

Constraints:
- **Determinism.** The engine is deterministic (invariant 1), so (seed, first, decks, actions) reproduce a match exactly. A replay costs 0.035 ms per match (measured on 2,400 bot matches; red-team measured 0.064 ms).
- **Hidden information.** It must stay server-side (invariant 6). Live seeds and deck orders are the most sensitive data stored.
- **Overlapping deploys.** Railway starts the new instance before stopping the old one (demo-mvp.md:388), so two writers briefly overlap on every deploy.
- **No waiting on storage.** A match must never wait for it.
- **Old pools.** The engine reads `CARDS` as a module global (engine.ts:5), so an old card pool can't be replayed without its old code.

Three decisions here are hard to reverse:
- the store;
- the record's shape;
- the player-key format, which is a protocol change.

## Options
**Store**
1. **Postgres on Railway**, on the private network.
   - For: SQL over jsonb, advisory locks, one vendor, no public exposure.
   - Against: a single container, and backups are ours to run.
2. **SQLite on a Railway volume.**
   - For: zero ops.
   - Against: a volume binds to one instance, and volume services redeploy with downtime, which conflicts with overlapping deploys.
3. **Neon or Supabase.**
   - For: point-in-time recovery and branching.
   - Against: a second vendor, public egress, and cold starts on the write path.
4. **JSONL in object storage.**
   - For: cheap.
   - Against: no SQL, so every stat needs a separate engine.

**Record shape**
- A. **Revision 1:** the raw input log as the only truth, in normalized tables. All stats are derived by a cron replay job that checks out old `build_sha`s in a git worktree. Keyed by a whole-pool hash.
- B. **One `match_records` row per match:**
  - the inputs (seed, first, dealt decks, actions);
  - the versions (build SHA, `ENGINE_VERSION`, `rulesHash`, a per-card `cardHash`);
  - the outcome;
  - a `facts` jsonb computed by an in-process replay at match end.

  Stats are SQL. The inputs are kept for verification and evaluation.
- C. **Every emitted event stored** (D1's `events` table): about 10x the rows, and a second truth that can drift from the engine.

**Player key**
- i. **A random key, stored hashed in a `players` table.** Verifying it needs the DB.
- ii. **A key signed by the server with HMAC-SHA256 (`id.mac`).** It needs no table and no DB round trip, and forged ids are rejected.
- iii. **A client-generated uuid.** Anyone can claim any id and pollute the stats.

## Objections that mattered
Red-team round 1:
- **M3 changed the record shape from A to B.**
  - Old-pool replay needs old code, which means git in cron, and Railway's build has no git dependency today (env.ts:12 reads `RAILWAY_GIT_COMMIT_SHA`).
  - A whole-pool hash resets every card's stats on any card change.
- **M4 changed the ops:**
  - the server listens first and migrates in the background;
  - migrations are additive, with explicit column lists;
  - the drain is read from `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`;
  - the nightly dump is encrypted, because the repo is public;
  - one restore drill runs before anyone relies on the data.
- **B2 (the heuristic bot reads hidden state through its clone) changed the order:** a determinized bot ships first. Measured impact: 0 of 42,364 starter-deck decisions and 4 of 43,556 random-deck decisions change, so earlier labels are not measurably tainted.
- **The architect contested "mark lost matches at the next boot."** With overlapping deploys, a boot sweep would mark the old instance's live matches. So lost matches are written at SIGTERM, and crash losses stay in the logs only (the spec's Rebuttal 1).

## Decision
**Store 1 + record B + key ii.**

- **Postgres 16 on Railway.** The `pg` driver, with no ORM.
- **Migrations:** numbered, additive only, under `pg_advisory_xact_lock`, run in the background after `listen()`.
- **One `match_records` row per ended or lost match.** It is inserted fire-and-forget from a bounded queue, idempotent on the match uuid.
- **Stats** are grouped by (card id, `cardHash`), and `cardHash` excludes card text.
- **The normalized schema** (revision 1) is v2, reached by one `INSERT ... SELECT` when queries or volume need it.
- **Player key:** `b64url(16 random bytes) + '.' + b64url(HMAC-SHA256(PLAYER_KEY_SECRET, id)[0..16))`.
  - It is sent in `HandshakeAuth.playerKey` and issued through `ServerToClient.player`.
  - It is shape-checked by `parsePlayerKey` in shared/protocol.ts and verified on the server.
  - It is never logged.
- **No `players`, `decks` or `collection_cards` tables. No retention sweep:** there is no PII.

| | Player impact | Risk | Effort | Reversibility | Invariants |
| --- | --- | --- | --- | --- | --- |
| **1 + B + ii (chosen)** | 4 | 4 | 5 | 4 | 5 |
| 1 + A + ii (revision 1) | 4 | 3 | 2 | 4 | 5 |
| 2 SQLite + B | 4 | 2 | 5 | 3 | 5 |
| 3 Neon + B | 4 | 3 | 4 | 4 | 5 |
| 1 + C (store events) | 4 | 3 | 3 | 3 | 4 |
| 1 + B + i (DB-backed key) | 4 | 3 | 3 | 4 | 5 |

## Revisit if
- **The card-stats query takes over 2 s, or `match_records` passes 200k rows:** move to the v2 normalized tables (spec section 2c).
- **A backfill needs a new metric over matches played on an older pool:** make the card pool an engine parameter (E1 territory) rather than replaying at old SHAs.
- **Crash-lost matches must be rows, or O2 rehydrates live matches:** add start rows and a per-instance heartbeat.
- **A second instance is needed for good:** Redis for the Socket.IO adapter, leases and rate limits. The schema stays.
- **Accounts arrive:** an account claims anonymous ids, and retention and deletion get revisited.
- **The `PLAYER_KEY_SECRET` leaks:** rotate it, which resets every anonymous identity. Add a key id (`kid`) to the format at that point.
