# `@bb/errors/src` — context

Implementation of `@bb/errors`. See [../README.md](../README.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — public re-exports. The only entry point other
  packages may import. Re-exports every error class from the per-area
  modules. Anything not re-exported here is internal.
- **[config-errors.ts](config-errors.ts)** — errors thrown by callers of
  `@bb/config`. Today: `ConfigIncompleteError` (carries the missing
  `Config[]` and the corresponding `bytebell set …` hints). Type-only
  imports `Config` from `@bb/types`.
- **[mongo-errors.ts](mongo-errors.ts)** — errors thrown by `@bb/mongo`
  and the knowledge-document subsystem. Today: `MongoConfigError` (missing
  URI; carries the `bytebell set …` hint), `MongoConnectError` (driver
  connect failed; redacts userinfo in the URI via the local `redactUri`
  helper), `MongoNotConnectedError` (`_getDb()` called before
  `connectMongo()`), `KnowledgeNotFoundError`
  (`setKnowledgeState` matched zero documents; carries the offending
  `knowledgeId`). Local helpers `describe` and `redactUri` are
  file-private.
- **[redis-errors.ts](redis-errors.ts)** — errors thrown by `@bb/redis`.
  Today: `RedisConfigError` (missing URL; carries the `bytebell set …`
  hint), `RedisConnectError` (ioredis connect failed; redacts userinfo via
  the local `redactUri` helper — the regex matches `redis://user:pass@host`
  identically to the mongo URI form), `RedisNotConnectedError`
  (`_getRedis()` called before `connectRedis()`). Local helpers `describe`
  and `redactUri` are file-private.
- **[queue-errors.ts](queue-errors.ts)** — errors thrown by `@bb/queue`.
  Today: `QueueConnectError` (BullMQ Queue construction failed; wraps the
  underlying cause via the local `describe` helper), `QueueNotConnectedError`
  (publisher or `registerWorker` called before `connectQueue()`; marker
  class with no extra fields).
- **[llm-errors.ts](llm-errors.ts)** — errors thrown by `@bb/llm`.
  Today: `LlmConfigError` (missing OpenRouter API key; carries the
  `bytebell keys set` hint), `LlmError` (HTTP non-2xx, timeout, empty
  completion; accepts an optional `cause`).
- **[ingest-errors.ts](ingest-errors.ts)** — errors thrown by
  `@bb/ingest-*` workers and `@bb/cli`'s ingest command. Today:
  `GitCloneError` (git binary failed; redacts userinfo in the repo URL
  via the local `redactUrl` helper), `IngestError` (catch-all worker
  failure; carries `knowledgeId` and an optional `cause`),
  `IngestPathError` (CLI pre-flight when `bytebell ingest <path>` is
  given a non-existent or non-directory path), `CancellationError`
  (cooperative cancellation signal thrown by `throwIfCancelled` between
  phases of the flat-folder strategy; carries `knowledgeId`. The
  orchestrator catches it, clears the cancellation flag, and returns
  _without_ flipping Mongo state to FAILED).
- **[server-errors.ts](server-errors.ts)** — errors thrown by `@bb/server`
  at boot. Today: `ServerConfigError` (missing required config keys;
  carries `missing[]` + the corresponding `bytebell set …` hints).
- **[neo4j-errors.ts](neo4j-errors.ts)** — errors thrown by `@bb/neo4j`.
  Today: `Neo4jConfigError` (missing URI / user / password; carries the
  `bytebell set …` hint), `Neo4jConnectError` (`verifyConnectivity()`
  failed; redacts userinfo in the URI via the local `redactUri` helper),
  `Neo4jNotConnectedError` (`_getDriver()` called before
  `connectNeo4j()`). Local helpers `describe` and `redactUri` are
  file-private.

## Module dependency graph

```
config-errors.ts → @bb/types (type-only: Config)
mongo-errors.ts  → (leaf — no imports)
redis-errors.ts  → (leaf — no imports)
queue-errors.ts  → (leaf — no imports)
llm-errors.ts    → (leaf — no imports)
ingest-errors.ts → (leaf — no imports)
server-errors.ts → (leaf — no imports)
neo4j-errors.ts  → (leaf — no imports)
index.ts         → re-exports all eight error modules
```

No cross-file imports inside the package; no cycles possible.

## Invariants enforced here

- **One file per source area.** New error classes for a new package land in
  a new `<area>-errors.ts` file (e.g. `neo4j-errors.ts`, `redis-errors.ts`),
  never appended to an existing file.
- **`override readonly name` set on every class.** The string equals the
  class name. `@bb/logger` discriminates on this; renames are a
  coordinated workspace change.
- **Typed metadata, not message parsing.** Every class exposes structured
  fields (`hint`, `missing`, `hints`, `cause`) — consumers read those fields
  directly instead of regexing `error.message`.
- **Credential redaction at construction time.** Any constructor that
  accepts a connection URI must redact userinfo before composing
  `super(...)`. See `redactUri` in `mongo-errors.ts` for the canonical
  pattern.
- **No I/O, no logging.** This package never imports `@bb/logger` or any
  infra package — those packages import _from_ this one.

## Adding an error class

Follow the recipe in [../README.md](../README.md) under _How to extend_.
The new class lives in `src/<area>-errors.ts` (create the file if the area
is new), is re-exported from `index.ts`, and the throwing package adds
`@bb/errors` to its `dependencies`.
