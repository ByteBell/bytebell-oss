# `ingest-github / progress`

**Tier:** Domain extension port

## Responsibility

Defines the host-binary extension port for observing ingestion-phase progress without coupling `@bb/ingest-github` to any transport.

The strategy emits two kinds of signals through this port:

- **Intra-phase ticks** via `ProgressReporter` — one reporter per phase or sub-phase of one job, driven by the strategy as it makes progress.
- **Phase boundaries and terminal state** via `ProgressContext.phaseChanged / completed / failed`.

A host binary supplies a `ProgressContextFactory(knowledgeId)`. `@bb/server` does not — it falls back to `nullProgressContextFactory`, which discards every signal.

## Public API

- `ProgressPhase` — `"clone" | "scan" | "file_analysis" | "folder_analysis" | "indexing"`. `clone` and `scan` are emitted by `runGithub` (the runner) before the strategy starts, so SSE clients see liveness during the network/disk-bound prelude. `file_analysis`, `folder_analysis`, and `indexing` are emitted by the strategy.
- `ProgressTotalMode` — `{ kind: "fixed"; total }` or `{ kind: "growing"; initialTotal? }`
- `ProgressReporterInput` — phase + sub-phase + total mode + optional restart-seed hook
- `ProgressReporter` — `start / increment / incrementSeen / setTotal / stop`
- `ProgressContext` — bundles `reporter()` with boundary-event publishers
- `ProgressContextFactory` — `(knowledgeId) => ProgressContext`
- `nullProgressContextFactory` — no-op fallback used when the host does not supply one

## Invariants

- Pure types and a no-op default. No transport. No outbound calls.
- Tracker decisions (sampling cadence, persistence, fanout) belong to the host implementation.
- The strategy must call `reporter.stop()` in a `finally` so the host can emit a final tick deterministically.
- Reporters returned for the same `(knowledgeId, phase, subPhase)` are not reused across invocations — each `reporter()` call returns a fresh instance.

## External dependencies

None.
