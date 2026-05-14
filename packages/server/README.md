# `@bb/server` — context

## Tier

Binary (deployable). Sibling to `@bb/cli`. Imports everything below the
binary tier — `@bb/types`, `@bb/errors`, `@bb/config`, `@bb/mongo`,
`@bb/redis`, `@bb/neo4j`, `@bb/queue`, `@bb/ingest-github`. Never
imports `@bb/cli`.

## Responsibility

Single-process Express daemon backing the `bytebell` TUI. Per
[docs/arch.md:53-62](../../docs/arch.md#L53-L62): boots all infra in
order, registers BullMQ workers in-process, exposes a small JSON HTTP
surface on `127.0.0.1`, single-tenant, no auth.

The package owns:

- Boot sequence — `loadConfig` validation → `connectMongo` →
  `connectRedis` → `connectNeo4j` → `ensureKnowledgeIndexes` →
  `connectQueue` → `registerGithubWorkers` →
  `registerLocalIngestWorker` → `app.listen` → write
  `~/.bytebell/pid`.
- HTTP routes: `GET /health` (pings Mongo + Redis + Neo4j),
  `POST /api/v1/github/index`, `POST /api/v1/local/index`,
  `GET /api/v1/repos`, plus the MCP routes (`POST|GET|DELETE /mcp`,
  `GET /sse`, `POST /sse/messages`) registered by `@bb/mcp`'s
  `mountMcp(app)` after the JSON routes.
- Knowledge-doc creation in **both** Mongo and Neo4j on each ingest
  request — `upsertKnowledge` + `upsertKnowledgeNode` run before the
  publisher transitions state to `QUEUED`.
- Filtered recursive copy for local ingest (`copyRepo.ts`) — files end
  up at `~/.bytebell/repos/<knowledgeId>/` regardless of source so MCP
  retrieval can read them later.
- Graceful shutdown — SIGTERM/SIGINT → drain MCP sessions
  (`closeAllMcpSessions`) → close queue → close redis → close neo4j →
  close mongo → unlink `~/.bytebell/pid` → exit. MCP sessions drain
  first so in-flight Streamable HTTP / SSE transports release before
  the BullMQ worker shuts down its Redis connection.

The package does **not** own:

- Worker handler bodies (those live in `@bb/ingest-github`)
- Knowledge / Raw schema (lives in `@bb/types` + `@bb/mongo`)
- Auth / rate-limit / CORS — single-tenant, localhost-only

## Public exports

`@bb/server` is a binary, not a library. The only contract is the `bin`
entry in `package.json`:

```jsonc
{ "bin": { "bytebell-server": "./src/index.ts" } }
```

The TypeScript exports (route builders, shutdown installer) are
**internal** — no other workspace package imports `@bb/server`.

## Routes

```
GET  /health                  → 200 { status: "ok", mongo, redis, neo4j }
                              → 503 { status: "down", … }

POST /api/v1/github/index     body: { repoUrl, branch?, gitToken? }
                              → 200 { knowledgeId, jobId }
                              → 400 invalid body / repoUrl format

POST /api/v1/local/index      body: { sourcePath: <abs> }
                              → 200 { knowledgeId, jobId }
                              → 400 missing / not exists / not a directory
                              → 422 sourcePath must be absolute

GET  /api/v1/repos            → 200 { repos: [...] }   (sorted updatedAt desc)

POST|GET|DELETE /mcp                       Streamable HTTP — owned by @bb/mcp
GET  /sse                                  legacy SSE stream — owned by @bb/mcp
POST /sse/messages?sessionId=…             legacy SSE messages — owned by @bb/mcp
```

## Data ownership

- `~/.bytebell/pid` — written at boot (mode `0644`), removed on graceful
  shutdown. Stale PID file is the signal that an earlier run crashed.
- `~/.bytebell/repos/<knowledgeId>/` — populated for both github (via
  worker's `gitClone`) and local-ingest (via this package's
  `copyRepo`). Persisted across job retries; never auto-deleted.

## Invariants

1. **Bind localhost only.** `app.listen(port, "127.0.0.1")`. v0 OSS is
   single-tenant local — no remote connections.
2. **Boot fails fast on missing config.** Required keys are
   `Config.MongoUri`, `Config.RedisUrl`, `Config.Neo4jUri`,
   `Config.Neo4jUser`, `Config.Neo4jPassword`,
   `Config.OpenrouterApiKey`. Missing → `ServerConfigError` with the
   matching `bytebell set …` hints, exit 1.
3. **Knowledge doc creation precedes enqueue and is dual-written.** Each
   ingest route calls `upsertKnowledge` (Mongo) + `upsertKnowledgeNode`
   (Neo4j) with `state: CREATED` before the publisher
   (`enqueueGithubIndex` / `enqueueLocalIngest`). The publisher's
   `setKnowledgeState(_, QUEUED)` then transitions the doc.
   3a. **Neo4j schema bootstrap runs once at boot.** `ensureKnowledgeIndexes`
   creates uniqueness constraints for `:Knowledge / :File / :Keyword /
:Class / :Function / :Module`; tolerant of existing indexes.
4. **Local ingest copies into `repos/`, not in-place.** The user's
   `sourcePath` is read-only; the canonical home for ingested files is
   `~/.bytebell/repos/<knowledgeId>/`. Future MCP retrieval reads from
   there.
5. **Filtered copy uses the same SKIP lists as `scan.ts`.** Lists are
   duplicated (small, stable) rather than imported across the
   infra/domain boundary.
6. **No env reads.** All config flows through `@bb/config`.
7. **PID file is best-effort.** Write fails are logged but don't block
   boot; unlink fails on shutdown are swallowed.

## External dependencies

- `express@5` — HTTP server
- `@types/express` (dev)
- Workspace deps: `@bb/config`, `@bb/errors`, `@bb/types`, `@bb/mongo`,
  `@bb/redis`, `@bb/neo4j`, `@bb/queue`, `@bb/ingest-github`

## What is intentionally out of scope (v0)

- Auth / rate-limiting / CORS — localhost-only single-tenant
- OpenAPI schemas per [CLAUDE.md _Rule of API Logging & Documentation_](../../CLAUDE.md) — defer
- Tar-streaming for `/api/v1/local/index` — JSON `{ sourcePath }` is
  enough for local CLI/server co-location
- Streaming progress responses — caller polls Mongo / `/api/v1/repos`
- `bytebell server stop | status | logs` — defer; user can
  `kill $(cat ~/.bytebell/pid)`
- `DELETE /api/v1/repos/:knowledgeId` (powers `bytebell clean`) — defer
- `GET /api/v1/repos/:knowledgeId` (single-doc read with file list) — defer

## How to extend

Adding a new route:

1. Create `src/<name>Route.ts` exporting a `build<Name>Route(): Router`.
2. Use the `express.Router()` pattern consistently. Validate the body
   with manual `if` checks (no zod dep — the route layer is thin).
3. Register in `src/routes.ts`'s `registerRoutes(app)`.
4. Update _Routes_ + _Public exports_ in this file.

Adding boot infra:

1. Add the `connect*` call to `src/index.ts`'s `main()` in correct order
   (config → mongo → redis → neo4j → schema bootstrap → queue → workers
   → listen → pid).
2. Add the matching `close*` call to `src/shutdown.ts` in reverse
   order, before the `unlink ~/.bytebell/pid`.
3. Update _Invariants_ if the new infra changes the boot contract.
