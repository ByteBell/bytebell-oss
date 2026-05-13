# `@bb/ingest-github/src/handlers`

BullMQ job entry shells. Pure boundary: narrow the payload, verify envelope
coherence, delegate to the pipeline runner. No I/O, no state transitions,
no clone — those belong in `pipeline/run.ts`.

## Files

- `ingest-job.ts` — `createGithubIngestHandler(deps)` and
  `createLocalIngestHandler(deps)` both return BullMQ-shaped
  `(msg) => Promise<void>` callbacks. They throw `IngestError` on validation
  failures; everything else propagates to BullMQ as the worker's failure path.
- `context.md` — this file.

## Invariants

- Handlers do not touch Mongo, Neo4j, the filesystem, or the LLM. They are
  pure validators that delegate to `IngestRunnerDeps.run`.
- Handlers are factory-built so the wiring in `index.ts` injects the runner
  the strategy is composed against. Tests can inject a mock runner.
