# `@bb/ingest-github/src/strategies/flat-folder`

The v2 ingestion strategy: clone → scan → big-file split → per-file analyse →
folder summary → repo summary → graph store. Each phase persists artifacts on
disk before the next begins, so a crash resumes cleanly from the next
sub-phase boundary.

## Phases

1. **classify-and-analyse-small** (`phases/classify-and-analyse-small.ts`) —
   walks `source.scan({ skipDecider })`; small files → LLM file-analysis →
   write `CondensedFileAnalysis` Oversized files → write a stub. Big-by-tokens
   files → append to `bigFiles.json` for Phase 2.
2. **process-big-files** (`phases/process-big-files.ts`) — reads
   `bigFiles.json`, calls `source.readFile(relativePath)` per entry,
   dispatches `processBigFile` sequentially (chunk-level concurrency
   inside).
3. **backfill-fields** (`backfill/fields.ts`) — top up `keywords`,
   `sideEffects`, `configDependencies`, `dataFlowDirection` on condensed
   entries that miss them. Idempotent.
4. **backfill-big-files** (`backfill/big-files.ts`) — re-condense entries
   whose chunks exist but condensed JSON is stale or missing.
5. **summarise-folders** (`folder-summary.ts`) — group condensed entries by
   `path.posix.dirname` (root = ""), one LLM call per folder, persist to
   `folder-summaries/<encoded>.json`.
6. **summarise-repo** (`repo-summary.ts`) — load folder summaries
   shallowest-first; one call if it fits `ContextWindowLimit`, batch +
   merge otherwise; persist `repo-summary.json` with the v2-flat envelope.
7. **store-flat-analysis** (`phases/store-flat-analysis.ts`) — ensure
   flat-folder indexes, upsert `:Repo`, then every `:Folder`, then every
   `:File` with the extended analysis + Folder→File `CONTAINS` edge.

## Files

- `index.ts` — `createFlatFolderStrategy(deps)` orchestrates the 7 phases.
- `types.ts` — `AnalyzedFileEntry`, `FolderSummary`, `RepoSummary`,
  `RepoSummaryEnvelope`, `FlatFolderResult`.
- `analyse-file.ts` — `analyseScannedFile(analyzer, file)` + `buildOversizedStub`.
- `folder-path.ts` — `directFolderOf`, `affectedFolderPaths`.
- `folder-summary.ts` — group + summarise + persist + iterate folder summaries.
- `repo-summary.ts` — single-shot or batched repo summary with envelope writer.
- `phases/classify-and-analyse-small.ts` — Phase 1.
- `phases/process-big-files.ts` — Phase 2.
- `phases/store-flat-analysis.ts` — Phase 7.
- `backfill/fields.ts` — Phase 3.
- `backfill/big-files.ts` — Phase 4.
- `big-file/` — chunker, analyzer, condenser, storage, cache for Phase 2 & 4.
- `prompts/` — LLM prompts shared across the phases.

## Invariants

- Disk is the inter-phase contract. No phase keeps state in memory past its
  end-of-phase write.
- LLM failures fall back to empty analyses or deterministic merges; the
  strategy never aborts on a per-file LLM error.
- `throwIfCancelled(knowledgeId)` runs at every phase boundary and between
  big-file chunks. A cancellation re-throws past the strategy boundary so
  the orchestrator clears the cancel flag without setting FAILED state.
- **All file content access goes through `input.source` (a `SourceReader`).**
  No phase calls `fs.readFile`, `path.join(repoDir, …)`, or
  `scanRepository(rootDir)` directly. This keeps the strategy decoupled
  from any specific reader implementation; any caller that supplies an
  alternative reader through the `sourceFactory` hook (see
  `docs/extension-points.md`) gets the same seven-phase pipeline unchanged.
- **Archive push is best-effort.** Phase 1 calls `input.archiveSink?.push`
  after `saveCondensed`; failures inside the sink are logged WARN and do
  not interrupt the analyse loop. The open-source binary never wires a
  sink — `archiveSink` is undefined and the call is skipped entirely.
