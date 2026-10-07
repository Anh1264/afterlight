# DATA - Data platform: match records, card stats, bot foundations

Size: L (epic, delivered as DP-1 to DP-4: three M and one S)    Owner: architect    Status: draft, revision 2 (after red-team round 1 and the orchestrator's rulings)
Written Wed 2026-10-07 against 7e39dd2. Narrows backlog D1, feeds G1 and G2, and is CV-1's storage (docs/specs/collection-v1.md). ADR: docs/decisions/0003-postgres-match-records.md.

## Context
Aiden (Oct 7): single player vs the bot first, a bigger card pool that players build decks from (collection-v1.md), stored match history and card stats, and a trained bot built in its own session that retrains as cards change. Today all state is one in-memory `rooms` Map (server/app.ts:142). The only record of a match is two log lines, `match_start` (app.ts:334) and `match_end` (app.ts:310). Nothing persists.

## Design

### 1. Approach
- **One row per match.** When a match ends, or is lost to a shutdown, the server inserts one `match_records` row. The row holds:
  - the match's inputs: seed, first seat, both deck lists in dealt order, and the ordered actions;
  - the versions: build SHA, `ENGINE_VERSION`, `rulesHash()`, and a hash per card;
  - the outcome;
  - a `facts` jsonb with per-card counts for stats.
- **Facts come from a replay at finishMatch.** The server replays the match in-process through a pure `matchFacts()` in shared/. That takes 0.035 ms per match (measured, below). The same replay checks the live result, so a determinism break shows up as `replay_ok = false` and an `error` line.
- **Stats are SQL** over those rows, grouped by (card id, card hash). A change to one card starts that card's stats again and leaves every other card's history in place.
- **The game never waits for the database.** The server listens first. Migrations run in the background, and inserts are fire-and-forget from a bounded queue.
- **The bot work in this epic is three pure pieces:** a determinized heuristic, `observe()` and `replay()`. A learned policy is specified (section 3e), not built.

**Rejected alternative: revision 1's design**, which red-team challenged:
- the raw log as the only truth, with normalized tables (`match_actions`, `match_card_facts`, a materialized view);
- a 15-minute derive job that replays old pools in a `git worktree` at their `build_sha`;
- a `BotPolicy` runner and an HTTP model client.

Why it was rejected:
- Replaying an old pool needs old code, and the engine reads `CARDS` as a module global (engine.ts:5), so a cron job has to check out history.
- A whole-pool version hash resets every card's stats whenever any card changes.
- The runner served a model that doesn't exist.

The normalized schema survives as "v2, when volume or queries need it" (section 2c). Moving to it is one `INSERT ... SELECT` from `match_records`.

### 2. Storage
#### 2a. Database and operations
- **Postgres 16 as a Railway service in the same project.** The app reaches it over the private network with `DATABASE_URL`. The driver is `pg`, with no ORM.
- **With `DATABASE_URL` unset, the recorder is `nullRecorder`.** Local dev, vitest and e2e are unaffected.
- **Boot order** (server/index.ts):
  1. `listen()`.
  2. Construct the recorder. Its constructor returns at once and runs the migrations in the background, so the game is up before the database answers.
  3. Until the schema is ready, records wait in the bounded queue (section 4). This is the ruling's "nullRecorder until ready", but records are queued instead of dropped. The game is just as decoupled from the database either way.
  4. If migration fails, the recorder logs an `error` line and retries with backoff from 1 s to 30 s.
- **Migrations:**
  - Files are `server/db/migrations/NNN_name.sql`.
  - They are applied in order, in one transaction, under `pg_advisory_xact_lock`, and tracked in `schema_migrations(id int PRIMARY KEY, applied_at timestamptz)`.
  - They are additive only: new tables, new nullable or defaulted columns, new indexes. A vitest scan fails on `DROP`, `RENAME`, `ALTER ... TYPE` or `SET NOT NULL`.
  - Every `INSERT` names its columns. While Railway overlaps deploys (the old instance runs until the new one passes /health, demo-mvp.md:388), the old code keeps writing to the new schema.
- **Drain.**
  - `optionsFromEnv` reads `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` and sets `drainMs = max(0, seconds*1000 - 500)`. When the variable is unset or 0, `drainMs` is 1500, a best effort, and `server_start` logs `drain: 'unset'`.
  - On SIGTERM, `server/index.ts` does three things in order:
    1. `srv.recordLiveAsLost()`;
    2. `await recorder.flush(drainMs)`;
    3. exit 0.
  - With `nullRecorder` the flush resolves at once, so the existing SIGTERM e2e (e2e/server-ended.spec.ts:68) still sees an immediate exit.
- **Backups.**
  - `.github/workflows/db-backup.yml` runs nightly, plus `workflow_dispatch`:
    - `pg_dump -Fc` over Railway's TCP proxy, as a read-only `backup` role (secret `BACKUP_DATABASE_URL`);
    - encrypted with `age` to Aiden's public key (secret `BACKUP_AGE_RECIPIENT`);
    - uploaded as an artifact kept 30 days.
  - The repo is **public** (`gh repo view`: PUBLIC), so a dump is never uploaded unencrypted.
  - **One restore drill before anyone relies on the data:** `scripts/db-restore-drill.sh` decrypts a dump into a local `postgres:16` container and runs `npm run verify-records`, which replays every row and checks the outcome.
- **No retention sweep** (ruling 3). There is no PII. Revisit with accounts.

#### 2b. Schema v1 (migration 001)
```sql
CREATE TABLE IF NOT EXISTS match_records (
  id             uuid PRIMARY KEY,               -- randomUUID() at startGame
  v              smallint    NOT NULL,           -- record format, 1
  mode           text        NOT NULL,           -- 'bot' | 'link'
  started_at     timestamptz NOT NULL,           -- wall time
  ended_at       timestamptz NOT NULL,           -- wall time
  build_sha      text        NOT NULL,           -- env.ts:12; 'dev' locally
  engine_version int         NOT NULL,           -- shared/version.ts ENGINE_VERSION
  rules_hash     text        NOT NULL,           -- rulesHash(): RULES + DECK_RULES
  end_reason     text        NOT NULL,           -- normal|forfeit|leave|disconnect|error|idle|lost
  outcome        text        NOT NULL,           -- 'p0'|'p1'|'draw'|'void' (void: error, idle, lost)
  player0        uuid NULL, player1 uuid NULL,   -- from the HMAC key (section 3d); NULL for the bot seat
  bot_seat       smallint NULL, bot_version text NULL,   -- 'heur-2' after DP-1
  seed           bigint      NOT NULL,           -- the uint32 passed to createGame
  first_seat     smallint    NOT NULL,           -- always passed explicitly (risk R2)
  seats          jsonb       NOT NULL,           -- [SeatRec, SeatRec], section 3c
  steps          jsonb       NOT NULL,           -- LoggedStep[], section 3c
  rounds         jsonb       NOT NULL,           -- RoundResult[] (engine.ts:40) as played live
  replay_ok      boolean     NOT NULL,           -- in-process replay reproduced `rounds` and the winner
  facts          jsonb NULL                      -- MatchFacts; NULL when the replay failed
);
CREATE INDEX IF NOT EXISTS match_records_ended ON match_records (ended_at);
CREATE INDEX IF NOT EXISTS match_records_p0 ON match_records (player0, ended_at) WHERE player0 IS NOT NULL;
CREATE INDEX IF NOT EXISTS match_records_p1 ON match_records (player1, ended_at) WHERE player1 IS NOT NULL;
```
- There are no `players`, `decks` or `collection_cards` tables (ruling 1):
  - decks live in the browser;
  - a player exists only as the ids on their match rows;
  - "first seen" is `min(ended_at)`.
- **Row size.** All figures are measured on 2,400 bot-vs-bot starter matches (scratch prototype, Oct 7):
  - the inputs JSON averages 2.2 KB (max 2.5 KB; 28.2 actions; the two decks are 0.6 KB) and gzips to 0.5 KB;
  - facts are an estimated 2 KB (about 14 distinct cards x 2 seats x about 70 B);
  - planning number: **5 KB per row**, red-team's estimate kept as the budget. 100k matches is about 0.5 GB, 1M about 5 GB. Postgres TOAST-compresses jsonb above about 2 KB, so the real footprint is lower.
- **Queries cheap enough at v1 volume** (sequential scans with `jsonb_each` are fine to about 200k rows). Each one is in `server/db/queries.sql` with a test against seeded rows:
  1. win rate vs the bot by `seats->h->>'source'`;
  2. per (card id, card hash): games in deck, drawn, played, played by round, win rate when in deck and when played (join on `outcome`), and `avg_swing = sum(s)/sum(plays)`;
  3. adds and cuts against the nearest premade: compare `seats->h->'deck'` with the registry in a script, later;
  4. per player: matches, distinct days, returns within 7 days, from `player0`/`player1` and `ended_at`;
  5. per bot version: win rate vs humans. Any row replays exactly with `replay()`.

#### 2c. v2, when volume or queries need it (not built)
- **Trigger:** query 2 takes over 2 s, or the table passes 200k rows.
- **Then:** `match_seats`, `match_actions` and `match_card_facts` (revision 1's shapes, without the `players`/`decks` FKs) are filled by one `INSERT ... SELECT` from `match_records` with `jsonb_array_elements`/`jsonb_each`, and new rows are dual-written.
- `match_records` stays the source.

#### 2d. What collection-v1's "Data to log" becomes (ruling 4: anything replay can derive is derived)
| Event | Where it lives |
| --- | --- |
| `player_created`, `session` | Not stored. A player's first match row is their first appearance. `connect` stays a log line (app.ts:424), without the id. |
| `match_start` | Columns of the row (`started_at`, seats, seed, first). The `match_start` log line stays. |
| `action` (accepted) | `steps`, with the wall ms since match start. |
| `action` (refused), `deck_rejected`, `bot_deck_skipped` | Log lines only. |
| `round_end` | Derived. `rounds` holds the live scores; `facts.rounds` adds who passed first and the cards left in each hand. |
| `match_end` | The row itself. The log line stays. |
| `match_unfinished` | `end_reason = 'lost'`, written at SIGTERM (Rebuttal 1 covers why not "at the next boot"). |

### 3. Interfaces
#### 3a. shared/version.ts (new, pure)
```ts
export const ENGINE_VERSION = 1;                      // bump when the golden test says engine behaviour changed
export function cardHash(id: string): string;         // 12 hex: FNV-1a 64 over sorted-key JSON of CARDS[id]'s rules fields
                                                      // (id, house, tier, kind, power, grow, guard, shield, rally, echo, token,
                                                      //  rows, eff, resolve, lastWords); name, epithet and text excluded
export function rulesHash(): string;                  // 12 hex over RULES + DECK_RULES
export function listHash(cards: readonly string[]): string;   // 8 hex over the SORTED list: the premade version in deck_source
```

#### 3b. shared/replay.ts (new, pure)
```ts
export type LoggedAction = Action | { type: 'forfeit' };          // forfeit is not an Action (engine.ts:680)
export interface MatchInputs {
  seed: number; first: PIdx; houses: [House, House];
  decks: [string[], string[]];                                    // dealt order: it feeds the shuffle (engine.ts:114-115)
  steps: { s: PIdx; a: LoggedAction }[];
}
export interface ReplayStep {
  i: number; s: PIdx; a: LoggedAction; round: number;            // the round the action was taken in
  before: [number, number]; after: [number, number];             // totals(); `after` is roundEnd.scores when this step ended the round
  events: GEvent[];
}
export type ReplayResult =
  | { ok: true; state: GameState; eventsHash: string }           // eventsHash: FNV-1a 64 over every batch, createGame's included
  | { ok: false; at: number; error: string };
export function replay(m: MatchInputs, onStep?: (st: ReplayStep, g: Readonly<GameState>) => void): ReplayResult;
```
- `createGame` is called with `seed`, `first` and `decks` always, and names `['Player 1','Player 2']`.
- `eventsHash` exists for the golden test only. Production compares `rounds` and the winner, so `sendGame` (app.ts:265) is untouched.

#### 3c. shared/facts.ts and shared/observe.ts (new, pure); the record types
```ts
export interface CardFact { h: string; c: number; d: number; p: [number, number, number]; s: number }
// h cardHash, c copies in deck, d drawn (= plays + copies left in hand: a card leaves the hand only by doPlay, engine.ts:585),
// p plays in rounds 1..3, s summed swing (after - before, mine minus theirs) over its plays
export interface MatchFacts {
  v: 1;
  seats: [Record<string, CardFact>, Record<string, CardFact>];
  rounds: { scores: [number, number]; winner: PIdx | 'tie'; firstPass: PIdx | null; handLeft: [number, number] }[];
}
export function matchFacts(m: MatchInputs): { ok: true; facts: MatchFacts; state: GameState } | { ok: false; at: number; error: string };

export interface Observation {
  v: 1; seat: PIdx;
  view: PlayerView;            // viewFor(g, seat) (engine.ts:698), both names replaced by 'Player 1'/'Player 2'
  ownDeck: string[];           // SORTED multiset of the seat's remaining deck: its list minus what it has seen
  legal: Action[];             // [{ type: 'pass' }, ...candidatePlays(g, seat).filter(a => validate(g, seat, a) === null)]
}
export function observe(g: GameState, seat: PIdx): Observation;

// server/record.ts (server-only types; the row's jsonb columns)
export interface SeatRec {
  house: House; deck: string[];                 // dealt order
  source: string;                               // `premade:<id>@<listHash>` or 'custom' (ruling 1)
  bot: string | null;                           // HEURISTIC_VERSION for the bot seat
  device: DeviceClass | 'unknown' | 'bot';
}
export interface LoggedStep { s: PIdx; a: LoggedAction; w: number; clock?: true }   // w: WALL ms since match start, not think time (invariant 4)
```
`source`:
- Before CV-2, a seat dealt `null` (the bot room, app.ts:328) records `premade:starter-<house>@<listHash(deckList(house))>`, a PvP custom list records `custom`, and a PvP seat that sent no list records the starter.
- CV-2's registry supplies the premade id when it lands. Section 7 covers the merge.

#### 3d. Protocol: the anonymous player key (DP-2; this is ADR 0001's protocol area, recorded in ADR 0003)
```ts
// shared/protocol.ts
export interface HandshakeAuth { device?: DeviceClass; playerKey?: string }   // :37
export interface ServerToClient { ...; player: (p: { key: string }) => void }   // :52-56
export const PLAYER_KEY_RE = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/;
/** shape only; the signature is checked on the server */
export function parsePlayerKey(auth: unknown): string | null;

// server/identity.ts
export function issuePlayerKey(secret: Buffer): { key: string; playerId: string };   // id = 16 random bytes; key = b64url(id) + '.' + b64url(HMAC-SHA256(secret, id)[0..16))
export function verifyPlayerKey(secret: Buffer, key: string): string | null;          // the uuid-formatted id, or null (timingSafeEqual)
```
- **Server.** In `io.use` (app.ts:409), `socket.data.playerId` is set from a verified key. When the key is missing or fails verification, the server issues a new one and emits `player` once the connection opens.
- **Seats.** `Seat.playerId` is copied at `room:create` (app.ts:531) and `room:join` (app.ts:564). The bot seat gets `null`. A rejoin keeps the seat's original id.
- **Secret.** `PLAYER_KEY_SECRET` (32 or more bytes, base64) comes from the environment. When it's unset, the process uses a random secret and logs a `warn` line `player_key_secret_ephemeral`.
- **Never logged.** Neither the key nor the id appears in any log line, URL or payload to another socket (CV-1 c2).
- **Client** (client/src/net.ts:5):
  - `auth` becomes a callback, `cb({ device, playerKey: store.playerKey() })`, so reconnects send the current key.
  - `socket.on('player')` stores the key under `al:player`.
  - When storage is blocked, the key lives in a module variable for the tab.

#### 3e. The bot (DP-1)
```ts
// shared/bot.ts
export const HEURISTIC_VERSION = 'heur-2';     // 'heur-1' = the oracle bot before this epic; bump whenever decide() changes
/** A copy of g that holds only what `me` may know:
 *  - me's deck: same cards, sorted by (cardId, uid), then shuffled with rnd;
 *  - the opponent's hand, deck and discard: same counts, refilled from deckPool(opponent house) with rnd;
 *  - rng: reseeded from rnd. */
export function determinize(g: GameState, me: PIdx, rnd: () => number): GameState;
export function decide(g: GameState, me: PIdx, rnd: () => number = Math.random): Action;   // signature unchanged (bot.ts:131)
```
- `decide` runs its current body on `determinize(g, me, rnd)`.
- The returned uids are the bot's own hand and the board's, which determinize leaves unchanged. So callers are unchanged: app.ts:354, sim.ts:39 and bot.test.ts.
- **Measured** (prototype of exactly this, Oct 7):
  - **Starter decks:** 0 of 42,364 bot decisions change.
  - **Random legal decks:** 4 of 43,556 change (0.01%).
  - **DM-1:** c1 stays 100.0% (bar 98%), c1b stays 87.9% (bar 85%), and the c3 snapshot differs in 0 of 400 lines. No qa test or snapshot changes.
  - **The matrix:** first-seat win rate is 48.4% both ways.
  - **Why so few change:** the leak (bestPlay's clone, bot.ts:73) only matters through random Last Words (engine.ts:189-193) and draw effects inside takeRoundCost's 2-step lookahead (bot.ts:115-139), and no starter carries a random Last Words card.

**BotPolicy, specified, not built.**
- A future learned policy receives an `Observation` and returns an `Action`.
- It runs in a `worker_thread` or a separate process, never synchronously in the room loop.
- The room's bot timer (app.ts:350-355) starts the request and applies the answer only if `r.game` is the same object, `!g.over` and `g.turnNo` is unchanged.
- The answer goes through `parseAction` (protocol.ts:114) and `applyAction`'s validation, like a client's.
- On timeout, error or an illegal answer, it falls back to `decide`, and `decidedBy` is recorded as `heur-2`. The fallback rate is a /health counter, and a `bot_fallback` warn line is the alert.
- **The bot department starts from self-play** with the shared engine (`sim.ts`). Human `match_records` are its evaluation set, replayed with `replay()` and `observe()`. The training export is deferred until it asks for one.

#### 3f. Server (DP-3)
```ts
// server/record.ts
export interface MatchRecord { /* the row of section 2b, camelCase */ }
export interface MatchRecorder {
  end(rec: MatchRecord): void;                         // sync, O(1), never throws
  flush(deadlineMs: number): Promise<void>;            // SIGTERM; rows still queued at the deadline become `match_record` log lines
  stats(): { state: 'off' | 'migrating' | 'ready' | 'retrying'; queued: number; written: number; dropped: number; failures: number; lastOkS: number | null };
}
export const nullRecorder: MatchRecorder;
export function buildRecord(live: LiveMatch, end: { reason: MatchEnd; at: number; g: GameState }): MatchRecord;   // runs matchFacts, sets replay_ok
// server/db/pg-recorder.ts
export function createPgRecorder(o: { url: string; log: LogSink; maxQueued?: number /* 2_000 rows, ~10 MB */ }): MatchRecorder;
```
- **ServerOptions** (app.ts:41) gains `recorder?: MatchRecorder`. **GameServer** (app.ts:60) gains `recordLiveAsLost(): void`.
- **HealthJson** (app.ts:53) gains `db: ReturnType<MatchRecorder['stats']>`.
- **`MatchEnd`** (app.ts:58) gains `'lost'`.
- **The `Room`** (app.ts:75) gains a `LiveMatch` record: `{ id, seed, first, decks, sources, steps, startedAt }`.
- **startGame** (app.ts:323-339) does the following:
  - generates `seed = randomBytes(4).readUInt32LE(0)` and `first = randomInt(2)`;
  - passes them, plus explicit decks (`deckList(house)` where it passes `null` today, app.ts:328), to `createGame`;
  - E5 (making `seed` required in engine.ts:99-104) stays its own S item; the server no longer depends on the default.
- **act** (app.ts:367) appends `{ s, a, w }` after `applyAction` succeeds. The turn-clock pass (app.ts:362) adds `clock: true`.
- **endByForfeit** (app.ts:379) appends `{ type: 'forfeit' }` for the loser.
- **finishMatch** (app.ts:303) calls `recorder.end(buildRecord(...))` inside `try/catch → logError(log, 'record', e, r.rid)`. It is already the once-per-match exit.
- **recordLiveAsLost** calls `finishMatch(r, 'lost')` on every room with `matchOpen`. The rooms keep running until the process exits, but `matchOpen = false` stops a second write.
- **Write loop.**
  - One async loop takes up to 50 rows per tick and runs a multi-row `INSERT (explicit columns) ... ON CONFLICT (id) DO NOTHING`.
  - Pool: `max 2`, `connectionTimeoutMillis 2000`, `statement_timeout 5000`.
  - On failure it writes one `error` line per failed write (CV-1 c5) and backs off from 1 s to 30 s.
  - On overflow it drops the oldest row, writes it as a `match_record` log line, and increments `dropped`.
- **Logging.** Every row is written to a log line only after its match has ended, so a live seed never reaches the log. Player ids are stripped from those lines; the line carries `player: true|false` per seat instead.

### 4. Invariants
1. **Determinism.**
   - `version.ts`, `replay.ts`, `facts.ts` and `observe.ts` are pure, with no Date or Math.random.
   - `determinize` takes `rnd`. `decide`'s existing `Math.random` default (bot.ts:131) is unchanged, and the server's bot moves reach the record as ordinary actions, so a replay never needs the bot's randomness.
   - `replay_ok` checks determinism on every production match.
2. **Server authority.**
   - The `playerKey` is shape-parsed (`parsePlayerKey`), then HMAC-verified.
   - `verify-records` parses rows read back from the DB with `parseMatchRecord` before replaying them.
   - A future policy's answers go through `parseAction` + `applyAction`.
3. **No rule numbers in the client.** It stores and sends one opaque string.
4. **No animation timings on the server.** `w` and the timestamps are labelled wall time. `drainMs` is a shutdown budget; `animTime` (app.ts:110) is unchanged.
5. **Card text.** No text changes. `cardHash` excludes text, so a text fix doesn't split a card's stats.
6. **Hidden information.**
   - Seeds and deck orders reach Postgres only in rows written after a match ends or is abandoned, and reach the log only for ended matches.
   - The backup is encrypted.
   - `observe()` and `determinize()` are property-tested to hold no hidden information (section 6).
   - After DP-1 the bot's decisions are too, so for the first time the bot plays fair.

### 5. Risks
| # | Risk | Mitigation / test |
| --- | --- | --- |
| R1 | An engine change without an `ENGINE_VERSION` bump makes old rows replay differently. | Golden corpus `shared/__golden__/replays.json` (60 seeded sim matches, both starter and random decks): the hashes must match while `ENGINE_VERSION` and every `cardHash` are unchanged. `npm run goldens` refuses to rewrite unless one of them changed. |
| R2 | Replay diverges from live: `createGame` draws one extra `rand` only when `first` is omitted (engine.ts:117). | The server always passes `first`. DP-3 test: every app.test.ts-style match has `replay_ok`. |
| R3 | A slow or down database stalls play. | Sync recorder, bounded queue. DP-3 test: a fake pool whose `query` never resolves, and a full bot match finishes on time with `queued` growing. |
| R4 | Two instances overlap during a deploy. | Inserts are idempotent on the uuid; migrations are additive with explicit columns and an advisory lock. Nothing is marked at boot (Rebuttal 1). |
| R5 | SIGKILL arrives before the flush. | Read the drain seconds (Aiden sets 10 s). Rows still queued at the deadline become `match_record` lines (sync stdout). |
| R6 | A crash (`uncaughtException` → `exit(1)`, log.ts:21-24) loses live matches with no row. | Accepted. They are `match_start` lines without a `match_end`. Rebuttal 1 gives the heartbeat option if Aiden wants rows. |
| R7 | `PLAYER_KEY_SECRET` is unset or rotated in production, so identities reset. | `player_key_secret_ephemeral` warn line at boot. Aiden sets the secret before DP-2 deploys. Rotation is documented as an identity reset. |
| R8 | The public repo exposes backups. | `age` encryption; the private key is held only by Aiden; the backup role is read-only. |
| R9 | `ownDeck` is not strict knowledge after a hand overflow: a card drawn at `HAND_MAX` goes silently to the discard (engine.ts:132), so the player doesn't know which. | Accepted and documented. The property test scrambles only the zones the seat never knows. Making overflow visible is a rules change, out of scope. |
| R10 | jsonb stats queries get slow. | v2 trigger (section 2c). |
| R11 | Bot leak returns as the pool grows (CV-2 premades may carry Paladin, Acolyte, Ember Sprite, Hex Doll: random Last Words). | DP-1's `decide` scramble property runs on random legal decks, so it covers the whole pool. |

### 6. Test plan
- **vitest, shared (DP-1).**
  - `replay()` of every fuzz-lite match reproduces the live `eventsHash`.
  - The golden test (R1).
  - `cardHash` changes on a power edit and not on a text edit, and an edit to one card leaves every other card's hash unchanged.
  - On 200 sim matches, `matchFacts` equals counts taken directly in the sim loop.
  - **Property:** `observe(scramble(g))` deep-equals `observe(g)`. The scramble covers the opponent's hand, deck and discard contents (same counts), the seat's deck order, `g.rng` and both names.
  - **Property (B2):** `decide(scramble(g), me, mulberry(k))` equals `decide(g, me, mulberry(k))` over 2,000 random-deck positions.
  - The existing DM-1 c1, c1b and c3 stay green unchanged (measured above).
- **vitest, server (DP-2).**
  - A malformed, forged or foreign-secret key gets a new key.
  - The same key gives the same `playerId` across reconnects.
  - A spy log sink sees neither the key nor the id in any line.
  - The `player` event goes only to its own socket.
- **vitest, server (DP-3).**
  - Every end reason gives exactly one record, `lost` included via `recordLiveAsLost`.
  - `replay_ok` holds on every server-test match.
  - The never-resolving pool (R3) leaves play unaffected.
  - Overflow writes `match_record` lines.
  - The migration scan rejects destructive SQL.
  - `*.pg.test.ts` runs only with `TEST_DATABASE_URL` set (CI: a `postgres:16` service on the check job). It covers: two concurrent `migrate()` calls are idempotent; inserts and their retries are idempotent; each query in `queries.sql` gives the expected numbers on seeded rows.
- **Playwright.**
  - DP-2: the key survives a reload; a second browser context gets a different key.
  - The existing bot-match e2e (`npm run e2e`) is unchanged and runs with `nullRecorder`.
- **Fuzzer** (sim.ts `runFuzz`, DP-1): replay equality on every fuzz match, and the observe and decide scramble properties on random-deck matches.

### 7. Work split
| # | Owner | Files | Acceptance |
| --- | --- | --- | --- |
| **DP-1** (M) | engine-dev; tests by qa-engineer | shared/bot.ts (`determinize`, `HEURISTIC_VERSION`), version.ts, replay.ts, facts.ts, observe.ts, sim.ts (fuzz hooks), `__golden__/replays.json`, scripts/goldens.ts, package.json (`goldens` script only) | Section 6, shared |
| **DP-2** (M) | server-dev, then client-dev | shared/protocol.ts (:37, :52, `parsePlayerKey`), server/identity.ts, server/env.ts (`PLAYER_KEY_SECRET`), server/app.ts (`io.use` :409, seat creation :531, :564, `SocketData` :59); client/src/net.ts | Section 6, DP-2; CV-1 c1, c2 |
| **DP-3** (M) | server-dev; Aiden adds the Railway Postgres service and the variables | server/record.ts, server/db/{pg-recorder,migrate}.ts, server/db/migrations/001_match_records.sql, server/db/queries.sql, server/app.ts (startGame, act, endByForfeit, finishMatch, /health, `recordLiveAsLost`), server/index.ts (SIGTERM), server/env.ts (`drainMs`, `DATABASE_URL`), scripts/verify-records.ts, package.json (`pg`, `verify-records`), .github/workflows/ci.yml (postgres service) | Section 6, DP-3; CV-1 c3-c7 |
| **DP-4** (S) | server-dev; Aiden runs the drill | .github/workflows/db-backup.yml, scripts/db-restore-drill.sh | A manual dispatch produces an encrypted artifact; the drill restores it and `verify-records` reports every row `ok` |

**Order.**
- **DP-1 runs in parallel with DP-2:** their files don't overlap.
- **Then DP-3**, which needs `replay`, `matchFacts` and `HEURISTIC_VERSION`, and edits app.ts and env.ts after DP-2.
- **Then DP-4.**
- **CV-2 and CV-3 need no database** and may ship first. CV-2 edits `startGame` and `lobby:deck` (app.ts:323, :579), so CV-2 and DP-3 merge one after the other, and the second rebases. Whichever lands second sets `Seat.deckSource`. DP-3 defines the default (section 3c).
- **CV-1 = DP-2 + DP-3** (plus DP-1 for c3).

### Flags for the orchestrator (not absorbed)
1. **E5** (engine.ts:104 `Math.random` default) stays a separate S item. After DP-3 the server never relies on the default, so requiring `seed` touches only engine.ts:99-104 and no caller.
2. **O2** (rehydrate live matches across deploys) will need a `live_matches` table with start rows and seat-token hashes. That is where the heartbeat in Rebuttal 1 belongs.
3. **CV-1 c4 needs new wording** (product-strategist): "A match lost to a server shutdown is recorded with reason `lost`; a crash leaves no record and is counted from the logs." The current text says "marked unfinished on the next boot".
4. **D1's backlog row** should be replaced by DP-1 to DP-4.

## Challenge

### Red-team round 1 (summary)
- **B1:** the two specs contradict each other.
- **B2:** the heuristic bot clones `g.rng` and so sees its own draws, which taints every outcome label.
- **M3:** replay across pool versions fails (git in cron; a whole-pool hash resets stats). Measured 0.064 ms per match; estimated 5-7 KB per match and 5 KB per observation row.
- **M4:** ops (migrate-at-boot, overlapping deploys, an assumed 5 s drain, no backup or drill, cost).
- **M5:** the sync `BotPolicy` and the speculative bot-http and bot-runner.
- **M6:** CV-1 needs the database, but Postgres was step 4.
- **Alternative:** one jsonb table, a fire-and-forget insert, pure `replay()`/`observe()` with a golden test, and self-play first.

### Rebuttal (architect, revision 2)
**Accepted:**
- **B1:**
  - Decks stay in the browser, so there are no `decks`, `collection_cards` or `players` tables.
  - Each seat records `deck_source` inline.
  - CV-1 maps to DP-2 + DP-3.
- **M3:**
  - The git-worktree replay and the derive job are gone.
  - Stats are keyed by a per-card hash.
  - My 3 KB row estimate was low: the inputs alone measure 2.2 KB and facts add about 2 KB, so the budget is 5 KB per row.
  - Replay measures 0.035 ms per match here (0.064 ms on red-team's run), cheap enough to run inside finishMatch.
- **M4:**
  - The server listens first and migrates in the background.
  - Migrations are additive with explicit columns.
  - The drain is read from `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`.
  - There is a nightly encrypted dump and one restore drill.
- **M5:** `BotPolicy` is specified only, and the async, worker-based rules are written down.
- **M6:** the reorder.
- **The alternative,** as v1.

**Contested, with evidence:**
1. **"Marked ... at the next boot" (ruling 2).**
   - **Why a boot-time mark doesn't work:**
     - Railway starts the new instance and waits for /health before stopping the old one (demo-mvp.md:388). At the new instance's boot, the old one's matches are still live, so a boot sweep would mark live matches as lost.
     - With one row written at the end, there is also no "open" row to mark.
   - **What I propose instead:**
     - SIGTERM writes `lost` rows. That covers every deploy, which is the common case.
     - A crash writes nothing to the database. Crashes are already `error` lines, and their matches are `match_start` lines without a `match_end`.
     - Marking crash losses in the database would need start rows plus a per-instance heartbeat (a table and a 30 s interval, about 40 lines). That belongs with O2, not v1.
   - **Aiden decides** whether crash losses must be rows.
2. **B2's premise, not its fix.**
   - **The leak is real,** and DP-1 removes it.
   - **The impact is small, measured:**
     - 0 of 42,364 starter-deck decisions change, and 4 of 43,556 (0.01%) with random legal decks;
     - DM-1 c1 is 100.0% and c1b 87.9% either way;
     - the c3 snapshot differs in 0 of 400 lines.
   - **So the outcome labels so far are not measurably tainted.**
   - **It still goes first,** because it costs one function and no test rewrites, and its scramble property is the only mechanical proof that the bot plays from public information.
   - **It does not need to "land before any logging" on its own merits.** Rows are tagged with `bot_version` either way (`heur-1` vs `heur-2`). The order is unchanged only because DP-3 needs DP-1's `replay()` anyway.
3. **"nullRecorder until ready" (ruling 6) is applied as "queue until ready".**
   - The game is equally decoupled: it never awaits, and the queue is capped.
   - Queueing avoids losing the first matches after every deploy, while the migration check runs.
   - It is not a real disagreement; I name it so the reviewer isn't surprised.

**Railway assumptions:**

| Assumption | Status | Evidence or action |
| --- | --- | --- |
| Whether Railway's build has `.git` | Moot | Nothing runs git at runtime any more. The repo already takes the SHA from `RAILWAY_GIT_COMMIT_SHA` (env.ts:12), verified earlier (demo-mvp.md:605). |
| Overlapping deploys | Assumed in the repo | demo-mvp.md:388. Designed for in R4 and Rebuttal 1. |
| Whether `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` is set, its default, and that SIGKILL follows the drain | Unverified | Aiden checks Settings > Deploy > Teardown, sets the drain to 10 s, and confirms `server_start` logs `drain: 10000`-ish. |
| The private-network `DATABASE_URL` reference (`${{Postgres.DATABASE_URL}}`) | Unverified | Aiden. |
| Exposing a TCP proxy for the backup job | Unverified | Aiden. The alternative is that Aiden runs `pg_dump` by hand weekly. |
| Postgres cost on Aiden's plan | Unverified | Aiden reads the usage page one week after DP-3. |
| Serverless (sleep) staying off for the Postgres service | Unverified | Aiden. |
| Whether public-repo artifacts are readable by any signed-in user | Assumed yes | The dump is encrypted regardless. |
