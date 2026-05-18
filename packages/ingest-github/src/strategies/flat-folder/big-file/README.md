# `@bb/ingest-github/src/strategies/flat-folder/big-file`

Splits oversized source files into line-aligned chunks, analyses each chunk
under bounded concurrency, persists chunk and manifest artifacts on disk
(resume-safe), and condenses the per-chunk analyses into a single
`CondensedFileAnalysis` via deterministic dedup or recursive LLM map-reduce
depending on chunk count and prompt budget.

## Files

- `detector.ts` — `classifyByTokens`, `buildBigFileEntry`, plus the on-disk
  `bigFiles.json` reader / writer / appender (dedupe-by-path on write).
- `chunker.ts` — `splitFileIntoChunks` (line-aligned, ≤ `MaxTokensPerChunk`).
- `chunk-analyzer.ts` — `analyzeChunk(chunk, llmCallContext?)` calls
  `askJsonLLM` with the chunk prompt; tolerates failures by returning an
  empty analysis. `llmCallContext` forwards per-job LLM credentials
  threaded through from `StrategyContext`.
- `condenser.ts` — `condenseChunks(relativePath, chunks)`:
  ≤ `SmallFileDedupThreshold` → deterministic merge (no LLM);
  above → recursive map-reduce. Per-condense LLM failure falls back to
  deterministic dedup so recursion always terminates.
- `storage.ts` — on-disk cache (chunk JSON, manifest, condensed analysis) +
  `iterateCondensed(metaPaths)` async iterator used by Phase 5.
- `cache.ts` — `inspect(metaPaths, relativePath)` returns `complete`,
  `stale-condensed`, or `missing`. Used by Phase 2 to short-circuit and by
  Phase 4 to find candidates for cheap re-condense.
- `index.ts` — `processBigFile({knowledgeId, metaPaths, relativePath, content,
sizeBytes, llmCallContext?, progressContext?})`. Sequential per file
  (chunk-level concurrency inside). Persists every intermediate artifact,
  so a restart resumes from the next unfinished chunk. `llmCallContext`
  is forwarded to every chunk analyzer call so per-job LLM credentials
  reach `@bb/llm`. When `progressContext` is present, the chunk pool runs
  under a fixed-total reporter
  (`subPhase: "big_file:<relativePath>"`, `total = chunks.length`) so
  long single-file analyses surface as live `PHASE_TICK` envelopes
  carrying per-chunk progress instead of looking frozen.

## Invariants

- One big file at a time. Concurrency lives at the chunk level inside
  `processBigFile`, never across files, to bound peak memory.
- Every artifact is durable on disk before the next step. The chunk cache
  short-circuits on re-runs; the manifest plus condensed JSON are the
  Phase 7 graph-store inputs.
- Cancellation is checked between chunks (`throwIfCancelled(knowledgeId)`).
