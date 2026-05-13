# `@bb/ingest-github/src/pipeline`

Orchestration plumbing shared by every strategy: cloning the source repo,
walking the working tree, resolving the branch, bounded concurrency, and a
minimal in-process cancellation registry. `pipeline/` knows nothing about LLM
prompts, file analysis, or graph writes — that lives under `strategies/`.

## Tier

Domain (sub-folder of `@bb/ingest-github`).

## Files

- `paths.ts` — `reposRoot()`, `repoCloneDir(knowledgeId)`, `ensureReposRoot()`,
  `metaPathsFor(knowledgeId)`, `ensureMetaDirs(metaPaths)`, plus
  `encodeMetaPath`/`decodeMetaPath` (slash/backslash → `__SL__`/`__BS__` so
  paths flatten to one file on disk).
- `source.ts` — `syncRepository({ repoUrl, branch, destinationDir, gitToken? })`.
  Clone-or-fetch+reset against `origin/<branch>`, `--depth=1`. The pull plan
  may later relax depth; ingestion does not need full history. Wraps git
  failures in `GitCloneError` (from `@bb/errors`).
- `filters.ts` — `SKIP_DIRS`, `SKIP_FILES`, `BINARY_EXTENSIONS`, `looksBinary`,
  `passesPathFilters`. Now sourced from `skip-decisions/seed.ts`
  (`SEED_DIRECTORIES`/`SEED_FILENAMES`/`SEED_EXTENSIONS`) plus a small
  legacy literal block so the public scanner still rejects `.DS_Store`,
  lockfiles, and binary assets without requiring the seed JSON. Pure
  data; no I/O.
- `skip-decisions/` — LLM-backed unknown-extension gate. See
  `skip-decisions/context.md`. Active when `Config.SkipDecisionEnabled =
true` (default). Consumed by `scan.ts` via the optional `skipDecider`
  dep; built by `classifyAndAnalyseSmall` if not injected.
- `disk-source-reader.ts` — `createDiskSourceReader({ repoDir, commitHash })`
  returns a `SourceReader` that wraps `scanRepository` + `node:fs.readFile`.
  The default reader the open-source binary always uses, unless the caller
  injects a `sourceFactory` (see `docs/extension-points.md`).
- `scan.ts` — async generator `scanRepository(rootDir, deps?)` yielding `ScanEntry`
  (`kind: "file"` or `kind: "oversized"`). A file is `oversized` when its
  byte size exceeds `Config.AbsoluteFileSizeCap` (skipped before read) or
  when its line count exceeds `Config.BigFileLineThreshold` (default 1200;
  enters the big-file phase). Both thresholds are config-driven — no
  magic numbers in this file. `readScannedFile` re-reads a file by
  absolute path for the big-file phase which streams content lazily.
- `run.ts` — `createPipelineRunner({ reposRootDir, strategy, sourceFactory? })`
  builds an `IngestRunnerDeps`. GitHub payloads run: branch resolve,
  source-reader construction, strategy execute, commit persistence. Local
  payloads skip the clone. The source reader is chosen by the optional
  `sourceFactory` parameter: if undefined (open-source default), the
  runner builds a `DiskSourceReader` via `source.ts.syncRepository` +
  `readHeadCommitHash`. If a factory is supplied, the runner calls it
  with `{ knowledgeId, payload, branch }` and uses the returned reader +
  commit hash; the local clone is skipped. The factory may also return an
  `archiveSink` which the strategy then threads through to its
  analyse phase. `resolveOrgId(payload)` returns
  `payload.orgId ?? getConfigValue(Config.OrgId)` — the only place orgId
  is resolved. State transitions (`CREATED → QUEUED → INGESTED → …`) are
  persisted to Mongo + Neo4j via `transitionState`, and
  `CancellationError` is re-thrown without flipping to FAILED.
- `branch.ts` — `resolveBranch(knowledgeId, payload)`. Defaults to `main` when
  the payload omits it; rejects branch names that don't match `^[\w./-]+$`
  with `IngestError` (defence against shell-injection into git args).
- `cancellation.ts` — in-process `Set<knowledgeId>` registry + `markCancelled`,
  `clearCancellation`, `isCancelled`, `throwIfCancelled`, `CancellationError`.
  Strategies call `throwIfCancelled(knowledgeId)` between sub-phases. The
  cancel HTTP route flips the bit; the orchestrator clears it on a
  `CancellationError` re-throw and leaves Mongo state untouched (no FAILED).
- `concurrency.ts` — `withConcurrency(n)` returns a `limit(task)` function in
  the `p-limit` style. `runInPool(n, items, task)` is a convenience over async
  iterables. No external `p-limit` dependency.

## Imports allowed

- Sibling files in this folder may import each other.
- Down: `src/types/*` only (intra-package, via the `src/*` alias).
- Up: `@bb/config`, `@bb/types`, `@bb/errors`, `@bb/logger`, `node:*`.
- `run.ts` additionally imports `@bb/mongo`, `@bb/neo4j`, and `@bb/llm`
  for state transitions, graph state writes, and cost estimation
  respectively — it is the orchestrator that owns those side effects so
  the strategies stay pure.
- Forbidden: importing from `../strategies`, `../adapters`, `../handlers`.

## Invariants

- Every file is ≤ 300 lines.
- No graph traversal, no per-file Mongo writes happen here — those live
  under `strategies/`. `run.ts` only performs end-of-pipeline state
  transitions and stats persistence. **Exception**: `skip-decisions/`
  uses `@bb/llm` for the unknown-extension YES/NO gate; this is the
  one LLM-touching path in `pipeline/` and is gated by
  `Config.SkipDecisionEnabled`.
- `scanRepository` never blocks the event loop on a large repo: it streams via
  `opendir` + per-file `readFile`; it never buffers the full tree.
- Tunable scan thresholds (`Config.AbsoluteFileSizeCap`,
  `Config.BigFileLineThreshold`) are read from `@bb/config` — never
  declared as in-file constants. Same for `Config.OrgId` in `run.ts`.
