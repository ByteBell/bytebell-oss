# `@bb/neo4j` — context

## Tier

Infrastructure. Depends on Kernel (`@bb/types` for `Config` and
`KnowledgeState`, `@bb/errors` for typed error classes) and Infrastructure
sibling (`@bb/config` for `Config.Neo4jUri / Neo4jUser / Neo4jPassword`).
May be imported by Strategy (`@bb/queue` workers via `@bb/ingest-github`),
Domain, and Binaries — never by `@bb/cli`.

For v1 this single package owns **both** the driver primitives (lifecycle,
ping, raw cypher) **and** the typed graph helpers (knowledge nodes, file
nodes, indexes). The arch.md tier diagram reserves a separate `@bb/graph`
for the typed query layer; we collapsed for v1 to keep boilerplate low.
When `@bb/mcp` retrieval lands and needs to read the same graph, the
helpers will graduate into a dedicated `@bb/graph` package and `@bb/neo4j`
shrinks to driver-only — mirroring the `@bb/redis` + `@bb/queue` split.

## Responsibility

The package owns:

- A single shared `neo4j-driver` `Driver` instance (lazy, idempotent
  connect; graceful close)
- A health probe (`pingNeo4j`) backed by `verifyConnectivity()`
- An internal `_runCypher(query, params)` helper that runs a query in a
  one-shot session and returns rows as plain objects
- Schema bootstrap (`ensureKnowledgeIndexes`) — uniqueness constraints
  for `:Knowledge / :File / :Keyword / :Class / :Function / :Module`,
  plus three fulltext indexes that power `@bb/mcp` retrieval
  (`idx_file_purpose_summary_ft`, `idx_keyword_name_ft`,
  `idx_symbol_signature_ft`). Tolerant of pre-existing indexes (Neo4j
  refuses constraints when a matching plain index already exists; we
  log + skip)
- Knowledge-node CRUD (`upsertKnowledgeNode`, `setKnowledgeStateInGraph`,
  `deleteKnowledgeGraph`). `deleteKnowledgeGraph` runs two
  `DETACH DELETE` cypher statements: one to remove every `:File` for
  that `knowledgeId` (which transitively detaches keyword / class /
  function / import edges), and one to remove the `:Knowledge` node
  itself. Called by the server's `DELETE /api/v1/repos/:knowledgeId`
  route.
- File-node CRUD (`upsertFileNode`) — composes the per-file relationships
  (`:HAS_KEYWORD / :HAS_CLASS / :HAS_FUNCTION / :HAS_IMPORT`), clearing
  stale relationships before re-attaching for re-runs

The package does **not** own:

- Read queries — defer to a future `@bb/graph` once `@bb/mcp` retrieval
  has a use case
- Telemetry, retry, or transaction batching — driver defaults apply
- Migration tooling — the `IF NOT EXISTS` constraint creates handle
  schema drift; richer migrations land later

## Public exports

```ts
function connectNeo4j(): Promise<void>;
function closeNeo4j(): Promise<void>;
function pingNeo4j(): Promise<PingResult>;
function ensureKnowledgeIndexes(): Promise<void>;

function upsertKnowledgeNode(doc: KnowledgeDoc): Promise<void>;
function setKnowledgeStateInGraph(knowledgeId: string, state: KnowledgeState): Promise<void>;
function deleteKnowledgeGraph(knowledgeId: string): Promise<void>;
function upsertFileNode(input: UpsertFileNodeInput): Promise<void>;

function runCypher<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T[]>;

interface PingResult {
  ok: boolean;
  latencyMs: number;
}
interface UpsertFileNodeInput {
  knowledgeId;
  relativePath;
  language;
  sha;
  sizeBytes;
  analysis: FileAnalysis;
}
```

`_getDriver` and `__resetForTests` are **internal** — consumed only
inside the package. Higher tiers cannot reach a raw `Driver` handle.

`runCypher` is the **only** public read primitive — re-exported from
`_runCypher` so domain-tier consumers (`@bb/mcp` retrieval) can run
arbitrary read queries without each one being typed at the infra
layer. Writes still go through the dedicated `upsert*` helpers; the
`@bb/neo4j` package intentionally does not expose a raw `Driver` or
session.

## Graph schema (v1)

```
(:Knowledge {knowledgeId, sourceKind, sourceUrl, branch, repoName, state, createdAt, updatedAt})
  -[:HAS_FILE]->
(:File {knowledgeId, relativePath, language, sha, sizeBytes, purpose, summary, updatedAt})
  -[:HAS_KEYWORD]->  (:Keyword  {name})         // global, lowercase, MERGE-deduped
  -[:HAS_CLASS]->    (:Class    {signature})    // global, MERGE-deduped
  -[:HAS_FUNCTION]-> (:Function {signature})    // global, MERGE-deduped
  -[:HAS_IMPORT]->   (:Module   {name})         // global, MERGE-deduped
```

`Knowledge.repoName` is derived once at upsert time from the source —
`owner/repo` (with `.git` stripped) for github sources, basename of the
absolute path for local sources. It is a display label only; identity
remains `knowledgeId`.

Constraints (uniqueness, idempotent via `IF NOT EXISTS`):

- `Knowledge(knowledgeId)`
- `File(knowledgeId, relativePath)`
- `Keyword(name)`, `Class(signature)`, `Function(signature)`, `Module(name)`

Fulltext indexes (idempotent via `IF NOT EXISTS`, consumed by `@bb/mcp`
search/lookup tools — never read inside this package):

- `idx_file_purpose_summary_ft` — `(File.purpose, File.summary)`
- `idx_keyword_name_ft` — `(Keyword.name)`
- `idx_symbol_signature_ft` — `(Class|Function).signature`

Entity nodes are global (shared across all knowledge entries) so
cross-repo retrieval — "which files mention `auth` keyword across all
indexed repos" — is a single Cypher hop. Class / Function nodes use the
full analysis signature string (`"createApplication (~L32-150): factory entry"`)
as the identity property; semantic dedup of name-only collisions is a
future concern.

## Data ownership

The single shared `Driver` instance and all `:Knowledge / :File /
:Keyword / :Class / :Function / :Module` nodes + the four relationships
listed above. Nothing else in the graph is owned by this package; users
or other tools sharing the same Neo4j db are responsible for their own
labels.

## Invariants

1. **No env reads.** All config via `@bb/config` (`Neo4jUri / Neo4jUser /
Neo4jPassword`). Repo-wide ESLint rule blocks `process.env`.
2. **`connectNeo4j()` is idempotent and concurrent-safe.** Repeated
   calls return the existing driver; concurrent calls await the same
   in-flight connect promise.
3. **`closeNeo4j()` is graceful.** Clears the cached driver before
   awaiting `driver.close()` so a subsequent `connectNeo4j()` cleanly
   re-establishes.
4. **Errors are typed, not strings.** `Neo4jConfigError` carries the
   exact `bytebell set …` hint; `Neo4jConnectError` redacts userinfo
   in the URI; `Neo4jNotConnectedError` is a marker.
5. **Schema bootstrap is tolerant.** `ensureKnowledgeIndexes()` swallows
   "already exists" errors (Neo4j refuses constraints when a matching
   plain index exists). Operators must drop conflicting indexes manually
   if uniqueness guarantees matter.
6. **`upsertFileNode` clears stale relationships before re-attaching.**
   Re-runs of the same `(knowledgeId, relativePath)` produce a clean
   relationship set rather than accumulating outdated keywords/imports.
7. **No raw `Driver` leaks.** `_getDriver()` is not in `src/index.ts`.
   Higher tiers go through the typed helpers.

## External dependencies

- `neo4j-driver@^6` — official driver
- `@bb/config`, `@bb/types`, `@bb/errors` — workspace deps

## What is intentionally out of scope (v0)

- Read queries (defer to `@bb/graph`)
- Cypher transactions / batch writes (single-statement per call)
- Schema migrations / drops / renames (only `IF NOT EXISTS` creates)
- Multi-database support (we use the default `neo4j` db)
- Pub/sub / change-data-capture
- Pruning of orphan `:Keyword / :Class / :Function / :Module` nodes
  when files are deleted (future cleanup pass — `deleteKnowledgeGraph`
  detaches edges but leaves the global entity nodes for cross-repo dedupe)

## How to extend

Adding a new node label or relationship:

1. Add the constraint to `CONSTRAINTS` in `src/indexes.ts`.
2. Add a typed helper to `src/<area>.ts` (or extend an existing file).
3. Re-export from `src/index.ts`.
4. Update the _Graph schema_ + _Public exports_ sections of this file.

Splitting into `@bb/neo4j` + `@bb/graph` (when `@bb/mcp` retrieval lands):

1. Move `indexes.ts`, `knowledge.ts`, `files.ts` into a new
   `packages/graph/` package.
2. `@bb/neo4j` keeps `client.ts` only and exposes `_runCypher` as a
   public export for `@bb/graph` to consume.
3. Update workspace deps for `@bb/ingest-github` and `@bb/server`.
