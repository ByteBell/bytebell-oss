# `@bb/ingest-github/src/strategies`

Ingestion strategies live here. Each subfolder is one strategy with its own
`README.md`. The orchestrator (`pipeline/run.ts`) dispatches to exactly one
strategy per job.

## Strategies

- **`flat-folder/`** — active. v2 strategy: clone → scan → big-file split →
  per-file analyse → folder summary → repo summary → graph store. See its
  `README.md` for the 7-phase pipeline.
- **`basic-file-analysis/`** — archived. v1 strategy preserved as a
  `.archived` file. Not compiled, not exported.

Adding a new strategy means: new subfolder + new `README.md` + new
implementation of `IngestStrategy` from `types/strategy.ts` + wire it into
`index.ts`. The orchestrator is strategy-agnostic and only knows the port.
