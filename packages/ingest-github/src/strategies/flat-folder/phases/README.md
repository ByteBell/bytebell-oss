# `@bb/ingest-github/src/strategies/flat-folder/phases`

The main-line phases of the flat-folder strategy. Each file is one phase
entry point invoked by `createFlatFolderStrategy` in execution order.
Backfill (Phases 3 and 4) lives in the sibling `backfill/` folder; folder
and repo summarisation (Phases 5 and 6) live as `folder-summary.ts` and
`repo-summary.ts` at the strategy root.

## Files

- `classify-and-analyse-small.ts` — Phase 1.
  `classifyAndAnalyseSmall({knowledgeId, source, metaPaths, analyzer,
skipDecider?, archiveSink?, llmCallContext?})` walks `source.scan({
skipDecider, llmCallContext })` and per entry:
  - `kind === "oversized"` → write a stub via `buildOversizedStub` +
    `saveCondensed`, and append a `too-large` row to `bigFiles.json`.
  - token count > `Config.ContextWindowLimit` → buffer a
    `context-window-exceeded` row for Phase 2.
  - otherwise → run `analyseScannedFile(analyzer, entry)` and persist via
    `saveCondensed`, under a `withConcurrency(Config.ConcurrentWorkers)`
    limiter so analyses run in parallel.
    Cancellation is checked at scan boundaries and inside each task; the
    buffered big-file list is flushed via `writeBigFiles` after all tasks
    drain.
- `process-big-files.ts` — Phase 2.
  `processBigFilesQueue({knowledgeId, source, metaPaths, llmCallContext?})`
  reads `bigFiles.json`, skips `too-large` entries (counted as
  `skippedOversized`), short-circuits when `inspect` returns `complete`
  (counted as `cached`), reads the file via `source.readFile`, and
  dispatches `processBigFile` sequentially per file with the per-job
  `llmCallContext` threaded through. Cancellation re-throws past the
  phase; other errors are logged per file and counted as `failed`.
- `store-flat-analysis.ts` — Phase 7.
  `storeFlatAnalysis({scope, payload, branch, metaPaths})` ensures
  `flat-folder` Neo4j indexes, upserts `:Repo` (from `repo-summary.json`
  if present, empty payload otherwise), then iterates folder summaries
  via `iterateFolderSummaries` to upsert `:Folder`, then iterates
  condensed entries via `iterateCondensed` to upsert `:File`. Files whose
  containing folder was not in the summaries set get a synthesised empty
  `:Folder` so the `CONTAINS` edge always lands. `languageFromPath`
  fills `language` when the analysis left it blank.

## Public interfaces

- `classifyAndAnalyseSmall(input): Promise<ClassifyPhaseResult>` —
  `{ smallFilesAnalysed, bigFilesQueued, oversizedStubs, failed }`.
- `processBigFilesQueue(input): Promise<ProcessBigFilesResult>` —
  `{ processed, cached, failed, skippedOversized }`.
- `storeFlatAnalysis(input): Promise<StoreFlatAnalysisResult>` —
  `{ nodesWritten, foldersWritten, filesWritten }`.

Each phase returns its own counter shape; the strategy aggregates them
into `FlatFolderResult`.

## Data ownership

- Phase 1 writes condensed JSON (small files + oversized stubs) and
  `bigFiles.json`.
- Phase 2 writes chunk artifacts, the chunk manifest, and condensed JSON
  for big files via `processBigFile`.
- Phase 7 owns no disk artifacts. It reads the on-disk state produced by
  Phases 1–6 and writes Neo4j nodes (`:Repo`, `:Folder`, `:File`) plus
  the `CONTAINS` edge.

## Invariants

- Disk is the inter-phase contract; nothing crosses a phase boundary in
  memory.
- `throwIfCancelled(knowledgeId)` runs at every scan boundary, every
  big-file boundary, and before each Neo4j upsert in Phase 7.
- Per-file LLM or I/O failures are logged and counted; phases do not
  abort on a single bad file. Only `CancellationError` propagates.
- Phase 7 always emits a `:Repo` node, even when `repo-summary.json` is
  absent (logged as a `phase7` warning).
- Phase 1 respects `Config.ContextWindowLimit` and
  `Config.ConcurrentWorkers`; do not hardcode either.

## External dependencies

`@bb/llm` (`tokenLen`), `@bb/logger`, `@bb/config`, `@bb/types`
(`Config`, `GithubIndexPayload`), `@bb/neo4j` (`ensureFlatFolderIndexes`,
`upsertRepoNode`, `upsertFolderNode`, `upsertFileNode`, `NodeScope`),
`pipeline/scan.ts`, `pipeline/concurrency.ts`, `pipeline/cancellation.ts`,
and the sibling `flat-folder/{analyse-file, big-file, folder-summary,
folder-path}` modules plus `adapters/llm-file-analyzer.ts`
(`languageFromPath`).

## Tier

Strategy (under the `flat-folder` domain strategy).
