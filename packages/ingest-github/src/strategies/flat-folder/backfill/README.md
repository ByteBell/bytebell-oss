# `@bb/ingest-github/src/strategies/flat-folder/backfill`

Post-analysis top-up phases. After Phases 1 and 2 have produced
`CondensedFileAnalysis` JSON on disk, the backfill phases sweep the cache
to fill gaps left by per-file LLM noise or by interrupted big-file runs.
Both are idempotent and skip entries that already look complete.

## Files

- `fields.ts` — Phase 3. `backfillMissingFields(metaPaths, llmCallContext?, progressContext?)`
  iterates every condensed entry via `iterateCondensed`, computes which
  extended-analysis fields are missing (`keywords`, `ontologyConcepts`,
  `businessEntities`, `systemCapabilities`, `sideEffects`,
  `configDependencies`, `dataFlowDirection`, `integrationSurface`,
  `contractsProvided`, `contractsConsumed`, `sectionMap`), and asks one
  LLM call per file to fill only the missing slots. The response is
  validated and normalised (`pickStringArray`, `pickSections`) before
  being written back via `saveCondensed`. Entries with nothing missing
  are skipped without an LLM call. When `progressContext` is present
  this phase opens a growing-total reporter (`subPhase: "backfill"`)
  because `iterateCondensed`'s size is not known up front.
- `big-files.ts` — Phase 4. `backfillBigFiles({knowledgeId, repoDir,
metaPaths, llmCallContext?, progressContext?})` re-reads
  `bigFiles.json`, skips `reason === "too-large"`, and for each
  non-complete entry (per `inspect`) re-runs `processBigFile` against
  the file on disk so the condensed JSON is rebuilt from cached chunks
  where possible. When `progressContext` is present this phase opens a
  fixed-total reporter (`subPhase: "backfill:big_files"`, sized by
  `bigFiles.json`) and forwards itself into `processBigFile` so per-file
  chunk pulses also surface.

## Public interfaces

- `backfillMissingFields(metaPaths, llmCallContext?, progressContext?): Promise<{ updated, failed }>`
- `backfillBigFiles(input: BackfillBigFilesInput): Promise<BackfillBigFilesResult>`
  — `BackfillBigFilesInput` carries an optional `llmCallContext?: AskLlmOptions` that the inner `processBigFile` call uses to forward per-job LLM credentials, and an optional `progressContext?: ProgressContext` for the per-phase reporter described above.

Both return phase-summary counters consumed by `createFlatFolderStrategy`
to roll up into the strategy result.

## Data ownership

These phases own no new on-disk artifacts. They mutate existing condensed
JSON in place via `saveCondensed`, and (Phase 4) drive `processBigFile` to
refresh the chunk and condensed caches under `big-file/storage.ts`.

## Invariants

- Idempotent: a second run is a no-op once every entry passes the
  completeness check.
- Per-file LLM failure is logged and counted, never thrown. The phase
  continues to the next entry.
- LLM output is untrusted: missing slots are filled only when the response
  yields a non-empty value of the expected shape; partial responses leave
  unfilled slots for a future pass.
- Phase 4 never touches `reason === "too-large"` entries — those stay as
  stubs forever.

## External dependencies

`@bb/llm` (`askJsonLLM`), `@bb/logger`, `@bb/mongo` (types only —
`FileAnalysis`, `FileAnalysisSection`), the sibling
`flat-folder/big-file/` cache layer, and the prompts under
`flat-folder/prompts/backfill.ts`.

## Tier

Strategy (under the `flat-folder` domain strategy).
