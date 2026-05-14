# `@bb/mongo/src` — context

Implementation of `@bb/mongo`. See [../README.md](../README.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — public re-exports. The only entry point other
  packages may import. Exposes `connectMongo`, `closeMongo`, `pingMongo`,
  `setKnowledgeState`, `upsertRawFile`, and the `PingResult` /
  `FileAnalysis` / `RawFileDoc` types. Anything not re-exported here is
  internal.
- **[client.ts](client.ts)** — module-scoped `MongoClient` singleton plus
  the lifecycle (`connectMongo`, `closeMongo`), the health probe
  (`pingMongo`), and the **internal** `_getDb()` accessor. Reads the URI via
  `getConfigValue(Config.MongoUri)` from `@bb/config` + `@bb/types`. Throws
  typed errors from `@bb/errors` (`MongoConfigError`, `MongoConnectError`,
  `MongoNotConnectedError`). Also exposes `__resetForTests()` — test seam
  only, never imported by production code.
- **[collections.ts](collections.ts)** — the `Collections` enum: single
  source of truth for collection name strings. Today:
  `Collections.Knowledge = "knowledge"`, `Collections.Raw = "raw"`.
  `Nodes` and `Jobs` join when their helpers land. **Internal** — not
  re-exported from `index.ts`; consumed only by helpers in this folder.
- **[knowledge.ts](knowledge.ts)** — domain CRUD helper:
  `setKnowledgeState(knowledgeId, state)`. Uses `_getDb()` to access
  `Collections.Knowledge`, runs `updateOne({ knowledgeId }, { $set: {
"status.state": state, updatedAt: <now> } })`, and throws
  `KnowledgeNotFoundError` on `matchedCount === 0`. Called by `@bb/queue`
  publishers on enqueue.
- **[raw.ts](raw.ts)** — domain CRUD helpers for `Collections.Raw`. Defines
  the `FileAnalysis` and `RawFileDoc` interfaces (package-local until
  promotion to `@bb/types`). Exports:
  - `upsertRawFile(doc)` — `updateOne({ knowledgeId, relativePath }, { $set:
<doc + updatedAt> }, { upsert: true })`. Called by `@bb/ingest-github`'s
    worker for every scanned (added or modified) file.
  - `listRawFileShas(knowledgeId)` — projection-only read returning a
    `Map<relativePath, sha>` of the previously-indexed tree. Consumed by the
    pull worker to diff the new tree without needing git history.
  - `deleteRawFiles(knowledgeId, relativePaths)` — `deleteMany` with `$in`;
    no-op on empty input. Used by the pull worker to drop rows for files
    that vanished between commits.

## Module dependency graph

```
client.ts      → mongodb, @bb/config (getConfigValue), @bb/types (Config),
                 @bb/errors (Mongo* error classes)
collections.ts → (leaf — no imports)
knowledge.ts   → client.ts (_getDb), collections.ts (Collections),
                 @bb/types (KnowledgeState), @bb/errors (KnowledgeNotFoundError)
raw.ts         → client.ts (_getDb), collections.ts (Collections)
index.ts       → re-exports the public surface from client.ts + knowledge.ts +
                 raw.ts
```

No cycles. `collections.ts` is a leaf; `knowledge.ts` and `raw.ts` are
the two helpers composing `_getDb()` today.

## Invariants enforced here

- **Connect is idempotent and concurrent-safe.** `connectMongo()` short-
  circuits if `client !== null`; concurrent callers await the same in-flight
  `connecting` promise so a single connect is performed.
- **Close is graceful and re-entrant.** `closeMongo()` clears the cached
  client _before_ awaiting `client.close()` so a subsequent `connectMongo()`
  cleanly re-establishes; calling `closeMongo()` twice is a no-op.
- **No raw `Db` leak.** `_getDb()` is not in `index.ts`. Future typed
  collection helpers will live in this folder and compose `_getDb()`
  internally; consumers in higher tiers see only the typed helper signatures.
- **No env reads.** Only `getConfigValue(Config.MongoUri)` provides the URI.
  Repo-wide ESLint rule blocks `process.env`.
- **Errors carry typed metadata.** Construction sites use the catalog in
  `@bb/errors` — never inline `new Error(string)`. `MongoConfigError` carries
  the exact `bytebell set …` hint; `MongoConnectError` redacts userinfo in
  the URI before composing the message.

## Adding a CRUD helper

Follow the recipe in [../README.md](../README.md) under _How to extend_.
New files live as flat `src/<name>.ts` (the repo ESLint rule forbids
parent traversal, so subdirectories require import gymnastics — keep
`src/` flat unless the package outgrows it). The helper composes
`_getDb()` to obtain the `Db` handle and `Collections.<X>` for the
collection name; returns / accepts domain types from `@bb/types`; throws
typed errors from `@bb/errors`.
