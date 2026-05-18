# `@bb/ingest-github/src/handlers`

BullMQ job entry shells. Pure boundary: narrow the payload, verify envelope
coherence, delegate to the pipeline runner. No I/O, no state transitions,
no clone — those belong in `pipeline/run.ts`.

## Files

- `ingest-job.ts` — `createGithubIngestHandler(deps)` and
  `createLocalIngestHandler(deps)` both return BullMQ-shaped
  `(msg) => Promise<PipelineSummary>` callbacks (the summary carries
  per-commit `tokenUsage` including `costUsd` so the enterprise wrapper
  can mirror it to the knowledge record without a `processing_stats`
  round-trip). They throw `IngestError` on validation failures;
  everything else propagates to BullMQ as the worker's failure path.
- `README.md` — this file.

## Invariants

- Handlers do not touch Mongo, Neo4j, the filesystem, or the LLM. They are
  pure validators that delegate to `IngestRunnerDeps.run`.
- Handlers are factory-built so the wiring in `index.ts` injects the runner
  the strategy is composed against. Tests can inject a mock runner.
