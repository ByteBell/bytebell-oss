# `@bb/queue/src` — context

Implementation of `@bb/queue`. See [../README.md](../README.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — public re-exports. The only entry point other
  packages may import. Exposes `connectQueue` / `closeQueue`,
  `enqueueGithubIndex` / `enqueueGithubPull`, `registerWorker`, and the
  associated types. Anything not re-exported here is internal.
- **[manager.ts](manager.ts)** — module-scoped `Map<JobType, Queue>` plus
  the registered `Worker[]` and the `connecting` promise. Owns the queue
  lifecycle (`connectQueue`, `closeQueue`), the queue prefix (`"bb"`), the
  default job options (`attempts: 3`, fixed 5s backoff, removeOnComplete),
  and the internal accessors (`_getQueue`, `_registerWorker`,
  `_isConnected`). Throws `QueueNotConnectedError` when accessed before
  connect; `QueueConnectError` if BullMQ construction fails.
- **[envelope.ts](envelope.ts)** — pure helpers: `buildJobMessage(type,
priority, payload)` constructs the `JobMessage<P>` envelope (UUID v4 id,
  `attempt: 0`, ISO timestamp); `mapPriority(JobPriority)` returns the
  BullMQ numeric priority; `dedupeKey(type, knowledgeId)` returns the
  `${type}-${knowledgeId}` BullMQ jobId.
- **[github-index.ts](github-index.ts)** — `enqueueGithubIndex` publisher.
  Mongo write first (`setKnowledgeState(_, QUEUED)`), then BullMQ publish.
  Also exports `EnqueueOptions` (shared with `github-pull.ts`).
- **[github-pull.ts](github-pull.ts)** — `enqueueGithubPull` publisher.
  Same ordering and structure as the index publisher.
- **[workers.ts](workers.ts)** — `registerWorker(type, handler, opts?)`
  constructs a BullMQ `Worker` with the same connection options
  (`getRedisConnection()`) and the same prefix as queues. Default
  concurrency falls back to `getConfigValue(Config.ConcurrencyGithub)` for
  GitHub job types.

## Module dependency graph

```
manager.ts    → bullmq, @bb/types, @bb/errors, @bb/redis (getRedisConnection)
envelope.ts   → @bb/types
github-index.ts → manager.ts, envelope.ts, @bb/types, @bb/mongo
github-pull.ts  → manager.ts, envelope.ts, github-index.ts (EnqueueOptions),
                  @bb/types, @bb/mongo
workers.ts    → bullmq, manager.ts, @bb/types, @bb/errors, @bb/config, @bb/redis
index.ts      → re-exports the public surface
```

No cycles. `manager.ts` and `envelope.ts` are leaves within the package
(no intra-package imports). Publishers depend on both. `workers.ts`
depends only on `manager.ts`.

## Invariants enforced here

- **Connect is idempotent and concurrent-safe.** `connectQueue()` short-
  circuits if `queues.size > 0`; concurrent callers await the same
  in-flight `connecting` promise.
- **Close is graceful and ordered.** `closeQueue()` awaits worker
  `close()` first (so handlers finish), then awaits queue `close()`
  (which closes BullMQ's internal redis connections).
- **Mongo before BullMQ on enqueue.** Both publishers do
  `setKnowledgeState(_, QUEUED)` then `queue.add(...)`. The ordering is
  load-bearing — see [../README.md](../README.md) _Invariants_.
- **No raw `Queue` leak.** `_getQueue` is not in `index.ts`. Future
  publishers live in this folder and use the internal accessor; consumers
  in higher tiers see only the typed publisher signatures.
- **No env reads.** The redis URL is sourced via
  `@bb/redis.getRedisConnection()` (which itself reads
  `getConfigValue(Config.RedisUrl)`). Repo-wide ESLint rule blocks
  `process.env`.
- **Errors carry typed metadata.** Construction sites use the catalog in
  `@bb/errors` — never inline `new Error(string)`. `QueueConnectError`
  carries the underlying `cause`; `QueueNotConnectedError` is a marker.

## Adding a publisher / worker

Follow the recipes in [../README.md](../README.md) under _How to extend_.
New publishers live as flat files in `src/<job>.ts` (no subdirectories —
the repo's ESLint rule forbids parent traversal). Compose `_getQueue`,
`buildJobMessage`, `mapPriority`, `dedupeKey`, and `setKnowledgeState`.
