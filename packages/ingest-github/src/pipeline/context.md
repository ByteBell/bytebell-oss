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
  `passesPathFilters`. Pure data; no I/O.
- `scan.ts` — async generator `scanRepository(rootDir)` yielding `ScanEntry`
  (`kind: "file"` or `kind: "oversized"`). Oversized = larger than
  `Config.AbsoluteFileSizeCap` or `> 1 MiB` (small-file hard cap, kept
  in-memory load bounded). `readScannedFile` re-reads a file by absolute path
  for the big-file phase which streams content lazily.
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
- Down: `../types/*` only.
- Up: `@bb/config`, `@bb/types`, `@bb/errors`, `node:*`.
- Forbidden: importing from `../strategies`, `../adapters`, `../handlers`.

## Invariants

- Every file is ≤ 300 lines.
- No LLM imports, no graph imports, no Mongo writes here. Those live one tier
  up under `strategies/` (LLM, prompts) or in adapters.
- `scanRepository` never blocks the event loop on a large repo: it streams via
  `opendir` + per-file `readFile`; it never buffers the full tree.
