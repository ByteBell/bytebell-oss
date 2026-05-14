# `@bb/neo4j/src` — context

Implementation of `@bb/neo4j`. See [../README.md](../README.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — public re-exports. The only entry point
  other packages may import. Exposes the lifecycle (`connectNeo4j`,
  `closeNeo4j`, `pingNeo4j`), schema bootstrap
  (`ensureKnowledgeIndexes`), typed graph helpers (`upsertKnowledgeNode`,
  `setKnowledgeStateInGraph`, `upsertFileNode`), the public read
  primitive `runCypher` (a re-export of the internal `_runCypher` for
  domain-tier consumers), and the integer coercion `toNeo4jInt(n)` for
  any JS number bound into a Cypher `LIMIT`/`SKIP` clause. Plus the
  `PingResult` and `UpsertFileNodeInput` types. Anything not re-exported
  here is internal.
- **[client.ts](client.ts)** — module-scoped `Driver` singleton +
  lifecycle (`connectNeo4j`, `closeNeo4j`), the health probe (`pingNeo4j`,
  via `verifyConnectivity()`), the **internal** `_getDriver()` accessor
  and `_runCypher(query, params)` helper. Reads URI / user / password via
  `getConfigValue(Config.Neo4j*)` from `@bb/config` + `@bb/types`. Throws
  typed errors from `@bb/errors` (`Neo4jConfigError`, `Neo4jConnectError`,
  `Neo4jNotConnectedError`). Also exposes `__resetForTests()` — test seam
  only, never imported by production code.
- **[indexes.ts](indexes.ts)** — `ensureKnowledgeIndexes()` runs two
  schema lists at boot: `CONSTRAINTS` (uniqueness) and `FULLTEXT_INDEXES`
  (the three `idx_*_ft` indexes consumed by `@bb/mcp` retrieval). Both
  are `IF NOT EXISTS`. Tolerant: catches "already exists" /
  "EquivalentSchemaRuleAlreadyExists" failures (Neo4j refuses to create
  a constraint when a plain index already exists on the same
  label+property), logs the skip to stderr, and continues with the
  remaining statements. Operators must drop conflicting plain indexes
  manually if uniqueness guarantees matter.
- **[knowledge.ts](knowledge.ts)** — `upsertKnowledgeNode(doc)` MERGEs
  a `:Knowledge` node by `knowledgeId`, setting `sourceKind / sourceUrl /
branch / repoName / state / createdAt / updatedAt` (createdAt only on
  insert). `repoName` is derived once via `deriveRepoName(source)` —
  `owner/repo` (stripped of `.git`) for github sources, `path.basename`
  for local sources, with the original URL as a fallback when parsing
  yields too few segments. `setKnowledgeStateInGraph(knowledgeId, state)`
  is a state-only update used by the worker on each transition.
- **[files.ts](files.ts)** — `upsertFileNode(input)` is the per-file
  write. Performs five sequential operations:
  1. MERGE `:File {knowledgeId, relativePath}`, SET its scalar +
     list props, MERGE the `:HAS_FILE` rel from the parent
     `:Knowledge`. The list props persist the extended `FileAnalysis`
     fields directly on the node (rather than as related nodes):
     `ontologyConcepts`, `businessEntities`, `systemCapabilities`,
     `sideEffects`, `configDependencies`, `integrationSurface`,
     `contractsProvided`, `contractsConsumed`, plus the two
     position-aligned arrays `sectionNames` / `sectionDescriptions`
     (the flat representation of `FileAnalysis.sectionMap`, since
     Neo4j list properties can't hold objects). Empty arrays are
     written when the analysis omits a field — the property is always
     present so Cypher queries needn't branch on existence.
  2. DELETE all existing `:HAS_KEYWORD / :HAS_CLASS / :HAS_FUNCTION /
:HAS_IMPORT_INTERNAL / :HAS_IMPORT_EXTERNAL` rels so re-runs produce
     a clean entity attachment.
  3. UNWIND keywords (lowercased) → MERGE `:Keyword` + MERGE
     `:HAS_KEYWORD` rel.
  4. UNWIND classes → MERGE `:Class {signature}` + rel.
  5. Same for functions; imports split into two passes — `importsInternal`
     attaches `:HAS_IMPORT_INTERNAL`, `importsExternal` attaches
     `:HAS_IMPORT_EXTERNAL`. Both target the shared `:Module {name}` node.

  Each entity attachment runs in its own session (one network round-trip
  per group). Skipped entirely if the corresponding analysis array is
  empty.

  Also exports `deleteFileNodes(knowledgeId, relativePaths)` — `MATCH`
  - `DETACH DELETE` over the live `:File` set for the given paths. No-op
    on empty input. Used by the pull worker to remove files that vanished
    between commits; callers that need history must call
    `snapshotFilesToVersion` first (this only touches `:File`, never
    `:FileVersion`).

- **[fileVersions.ts](fileVersions.ts)** — `snapshotFilesToVersion`
  copies every live `:File` into a `:FileVersion(commitHash)` snapshot
  before a pull overwrites the live set. The SET clause must mirror
  the property list written by `upsertFileNode` (the scalar core
  fields plus all extended list properties — `ontologyConcepts`,
  `sideEffects`, `configDependencies`, …, `sectionNames`,
  `sectionDescriptions`) so the version history is lossless. When
  adding a new property to `:File`, also add it to the SET clause
  here, or version snapshots will silently drop it.

## Module dependency graph

```
client.ts     → neo4j-driver, @bb/config (getConfigValue), @bb/types (Config),
                @bb/errors (Neo4j* error classes)
indexes.ts    → client.ts (_runCypher)
knowledge.ts  → client.ts (_runCypher), @bb/types (KnowledgeDoc, KnowledgeSource, KnowledgeState), node:path
files.ts     → client.ts (_runCypher), @bb/mongo (FileAnalysis type)
index.ts      → re-exports the public surface from client.ts + indexes.ts
                + knowledge.ts + files.ts
```

No cycles. `client.ts` is the single root all helpers compose against.

## Invariants enforced here

- **Connect is idempotent and concurrent-safe.** `connectNeo4j()`
  short-circuits if `driver !== null`; concurrent callers await the same
  in-flight `connecting` promise.
- **Close is graceful and re-entrant.** `closeNeo4j()` clears the cached
  driver before awaiting `driver.close()` so a subsequent
  `connectNeo4j()` cleanly re-establishes; calling twice is a no-op.
- **Sessions are short-lived.** `_runCypher` opens a session per call
  and closes in `finally`. No session leaks even on driver-side errors.
- **Schema bootstrap is best-effort.** `ensureKnowledgeIndexes` logs +
  continues on conflicts; the worker still runs (uniqueness is desirable
  but not load-bearing for our single-process MERGE writes).
- **Stale relationships are pruned before re-attaching.** `upsertFileNode`
  always DELETEs the four relationship types before MERGEing fresh ones;
  changing analysis between runs doesn't accumulate dead pointers.
- **No env reads.** Only `getConfigValue(Config.Neo4j*)` provides creds.
- **Errors carry typed metadata.** Construction sites use the catalog
  in `@bb/errors` — never inline `new Error(string)`.
- **Cypher `LIMIT`/`SKIP` params are integers.** The JS driver maps
  bare `number` to Cypher `Float`, which Neo4j 5 rejects in `LIMIT`/
  `SKIP`. Callers must wrap any numeric bound used in those clauses
  with `toNeo4jInt(n)`. The wrapper returns a driver `Integer` that the
  driver serialises correctly.

## Adding a helper

Follow the recipes in [../README.md](../README.md) under _How to extend_.
New files live as flat `src/<name>.ts` (the repo ESLint rule forbids
parent traversal — keep `src/` flat). Helpers compose `_runCypher`;
never expose the raw `Driver` to callers.
