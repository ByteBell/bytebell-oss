# `@bb/queue` — context

## Tier

Strategy. May depend on Kernel (`@bb/types` for job enums + payloads,
`@bb/errors` for typed error classes) and Infrastructure (`@bb/config` for
concurrency settings, `@bb/redis` for the BullMQ-compatible connection
options blob, `@bb/mongo` for the knowledge-state transition on enqueue).
May be imported by Domain (`@bb/ingest-github` will register workers) and
Binaries (`@bb/server` will call publishers from HTTP routes). Never by
`@bb/cli`.

## Responsibility

The package owns:

- BullMQ `Queue` lifecycle — one `Queue` per `JobType`, instantiated at
  boot via `connectQueue()` and torn down via `closeQueue()`
- The two GitHub publishers — `enqueueGithubIndex` and `enqueueGithubPull`
- Worker registration — `registerWorker(type, handler, opts?)` constructs
  a typed BullMQ `Worker` from the same connection options
- The `JobMessage` envelope shape carried as BullMQ `job.data`
- Dedupe-key convention `${type}-${knowledgeId}` and BullMQ priority
  mapping (`Low=1000, Normal=100, High=10`)
- The Mongo `status.state → QUEUED` write that accompanies a successful
  enqueue (delegated to `@bb/mongo.setKnowledgeState`)

The package does **not** own:

- Worker handler implementations (live in `@bb/ingest-*`)
- Knowledge-document creation, deletion, or any mutation other than the
  state transition on enqueue (`@bb/mongo`)
- Recovery / restart / orphan re-enqueue (deferred — see _Out of scope_)
- Progress reporting, status validation, batch processing, admin
  pause/resume/cancel (all out of scope for OSS v0)
- Outbound telemetry of job lifecycle events (out of scope; structured `@bb/logger` output is the only sink)

## Public exports

```ts
function connectQueue(): Promise<void>;
function closeQueue(): Promise<void>;

function enqueueGithubIndex(payload: GithubIndexPayload, opts?: EnqueueOptions): Promise<string>;
function enqueueGithubPull(payload: GithubPullPayload, opts?: EnqueueOptions): Promise<string>;

function registerWorker<T extends JobType>(type: T, handler: JobHandler<T>, opts?: WorkerRegistrationOptions): Worker;

interface EnqueueOptions {
  priority?: JobPriority;
}
interface WorkerRegistrationOptions {
  concurrency?: number;
}
type JobHandler<T extends JobType> = (msg: JobMessage<PayloadFor<T>>) => Promise<void>;
```

`_getQueue`, `_registerWorker`, `_isConnected`, `__resetForTests`,
`QUEUE_PREFIX`, `mapPriority`, `dedupeKey`, `buildJobMessage` are
**internal** — consumed only inside the package.

## Data ownership

The `Map<JobType, Queue>` and the array of registered `Worker` instances.
No knowledge of payload semantics beyond the type contract from
`@bb/types`. No state in Mongo is owned by this package — the
`status.state → QUEUED` write is a delegated call into `@bb/mongo`.

## Invariants

1. **Mongo write before BullMQ publish.** Each publisher calls
   `setKnowledgeState(_, QUEUED)` first, then `queue.add(...)`. If Mongo
   succeeds and BullMQ fails, both operations are idempotent under retry
   (BullMQ dedupes by `jobId`, `setKnowledgeState` is a same-value set).
   Reverse ordering would race the worker against a stale `CREATED` state.
2. **Connection is required.** Calling any publisher or `registerWorker`
   before `connectQueue()` throws `QueueNotConnectedError`. `closeQueue()`
   is graceful and re-entrant.
3. **One queue per `JobType`.** The `Map<JobType, Queue>` is the single
   source of truth; consumers obtain a `Queue` via the internal
   `_getQueue(type)` accessor only.
4. **Workers close before queues.** `closeQueue()` awaits all worker
   `close()` first so they finish in-flight jobs before queues drop their
   redis connections.
5. **Dedupe key is stable.** `${type}-${knowledgeId}` — re-publishing the
   same logical job is a no-op; both calls return the same `jobId` string.
6. **Queue prefix is `"bb"`.** Distinct from the kube-package reference's
   `"kp"` so a shared dev redis can host both without key collisions.
7. **Priority mapping is fixed.** `Low→1000`, `Normal→100`, `High→10`.
   BullMQ uses smaller-number-wins; this maps the public 3-level enum to
   that ordering.

## External dependencies

- `bullmq` — queue runtime
- `@bb/types`, `@bb/errors`, `@bb/config`, `@bb/redis`, `@bb/mongo` —
  workspace deps (all explicit in `package.json`)

## What is intentionally out of scope (v0)

- Recovery / orphan re-enqueue on startup
- Progress reporting and node-status state machine
- Admin operations (pause / resume / cancel / inspect)
- Health monitor (covered by `pingMongo` + `pingRedis` at the server)
- Bitbucket / PDF / Website / Custom-context publishers — OSS is
  GitHub-only
- `GITHUB_REINDEX_FILES` partial-reindex job type
- `Critical` priority level (3 levels are enough for v0)
- Pre-enqueue knowledge-state assertion (caller ensures the doc exists;
  unconditional state set is fine)
- LLM credentials in the job payload — workers read OpenRouter key/model
  from `~/.bytebell/config.json` at handler time
- `gitToken` encryption — flows through redis in plaintext; acceptable
  for local single-tenant. Document at deployment time.

## How to extend

Adding a new GitHub job type (e.g. `GithubReindexFiles`):

1. Add the enum entry and payload interface in `@bb/types` `src/job.ts`,
   including a new branch in `PayloadFor`.
2. Add the type to `ALL_JOB_TYPES` in `src/manager.ts` so a `Queue` is
   constructed at boot.
3. Add a publisher (`src/github-reindex-files.ts`) following the
   `setKnowledgeState → queue.add` ordering invariant.
4. Update `defaultConcurrencyFor` in `src/workers.ts` if the type uses a
   different concurrency knob.
5. Re-export from `src/index.ts`. Update _Public exports_ in this file.

Adding a worker handler (in an ingest package):

1. Add `@bb/queue` to that package's `dependencies`.
2. Call `registerWorker(JobType.GithubIndex, async (msg) => { … })`
   during package bootstrap. The handler receives the typed
   `JobMessage<GithubIndexPayload>`.
3. The worker is auto-tracked; `closeQueue()` will close it on shutdown.
