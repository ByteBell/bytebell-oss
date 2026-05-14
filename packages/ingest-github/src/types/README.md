# `@bb/ingest-github/src/types`

Type-only barrel for the flat-folder ingestion package. No runtime code beyond
`emptyFileAnalysis()` and the `FALLBACK_LANGUAGE` constant.

## Tier

Domain (sub-folder of `@bb/ingest-github`).

## Files

- `strategy.ts` — `IngestStrategy`, `StrategyInput`, `StrategyResult`,
  `StrategyContext`. The strategy port the orchestrator dispatches to.
  `StrategyContext` carries `{ knowledgeId, orgId, repoId,
llmCallContext? }`; `llmCallContext` is the optional `AskLlmOptions`
  bag the runner builds from the job payload's LLM overrides and that
  each phase forwards into its `askJsonLLM` / `askYesNoLLM` calls. Absent
  in OSS standalone runs — calls fall back to `Config.OpenrouterApiKey`.
- `pipeline.ts` — `ScannedFile`, `OversizedFile`, `ScanEntry`, `FileAnalyzer`
  port, `AnalyzedFileResult`, `PipelineDeps`, `PipelineSummary`,
  `SkipDecider` / `SkipDeciderInput` / `SkipDecision` (the unknown-extension
  gate port; implementation lives under `pipeline/skip-decisions/`),
  `SourceReader` / `ScanDeps` (the repository-read abstraction; default
  implementation in `pipeline/disk-source-reader.ts`), `ArchiveSink` /
  `ArchiveSinkInput` (an optional non-fatal sink that the open-source
  binary never calls), `SourceFactory` / `SourceFactoryInput` /
  `SourceFactoryResult` (the optional index-side injection hook surfaced
  through `registerGithubWorkers`), and `PullFactory` / `PullFactoryInput`
  / `PullFactoryResult` (the analogous pull-side injection hook).
  `FileAnalyzer.analyze()`, `SkipDeciderInput`, and `ScanDeps` each accept
  an optional `llmCallContext?: AskLlmOptions` so per-job credentials
  flow from `StrategyContext` into every LLM call site without breaking
  the OSS standalone (defaults to undefined → config-driven). Both
  factories are documented in `docs/extension-points.md`. The two are
  separate because pull additionally needs a `diff` and a resolved
  `targetCommit`, which index doesn't.
- `meta-paths.ts` — `MetaPaths` shape (`~/.bytebell/repos/.meta/<knowledgeId>/...`).
- `file-analysis.ts` — `FALLBACK_LANGUAGE = "unknown"` and `emptyFileAnalysis()`
  factory. Both consumed by the LLM adapter and the big-file condenser.
- `condensed-file-analysis.ts` — `CondensedFileAnalysis` is the on-disk record
  written under `<metaPaths.fileAnalysisDir>/<encodedPath>.json` after Phase 1
  and Phase 2; the inter-phase contract that lets Phase 3+ resume after a crash.
- `big-file.ts` — `BigFileEntry`, `BigFileReason`, `FileChunk`,
  `ChunkAnalysisResult`, `HugeFileManifest`. The shapes used by `bigFiles.json`
  and the chunk/manifest cache under `<metaPaths.bigFileAnalysisDir>`.
- `ingest-runner.ts` — `IngestRunnerDeps` shape the orchestrator + handler share.
- `index.ts` — barrel.

## Invariants

- Only types live here, with the single exception of `emptyFileAnalysis()` and
  `FALLBACK_LANGUAGE` which are zero-cost constants/factories.
- No file in this folder may import from `pipeline/`, `strategies/`, or
  `adapters/` — the tier flow is one-way from types outward.
