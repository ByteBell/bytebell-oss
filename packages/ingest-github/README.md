# `@bb/ingest-github` — context

## Tier

Domain. Depends on Kernel (`@bb/types`, `@bb/errors`), Infrastructure
(`@bb/config`, `@bb/mongo`, `@bb/neo4j`), Cross-cutting (`@bb/llm`), and
Strategy (`@bb/queue`). May be imported by Binaries (`@bb/server` calls
`registerGithubWorkers()` and `registerLocalIngestWorker()` once at
boot). Never by `@bb/cli`.

## Responsibility

Consumes `JobType.GithubIndex` and `JobType.LocalIngest` jobs published
by `@bb/queue`. For each job, runs the active `IngestionStrategy` over
the populated `~/.bytebell/repos/<knowledgeId>/` directory and persists
per-file results to Mongo (`raw` collection via `@bb/mongo`) **and**
Neo4j (`:File` nodes + `:HAS_KEYWORD` / `:HAS_CLASS` / `:HAS_FUNCTION`
/ `:HAS_IMPORT_INTERNAL` / `:HAS_IMPORT_EXTERNAL` rels via `@bb/neo4j`). v1 ships one strategy —
`BasicFileAnalysisStrategy` — implementing the deliberately minimal
"very basic file analysis" approach.

The package owns:

- The `github_index` and `local_ingest` worker handlers (registered via
  `@bb/queue.registerWorker`)
- The git clone / fetch lifecycle for one repo per knowledge ID, kept on
  disk under `~/.bytebell/repos/<knowledgeId>/` for future `git_pull`
- The hardcoded ignore list (directories, lockfiles, binary extensions,
  size cap) for repo scanning
- The 9-field per-file LLM analysis prompt (small-file path) and the
  chunked + condensed analysis path for files above the token threshold.
  Field definitions live in `FILE_ANALYSIS_FIELDS_BLOCK` (single source
  of truth; wording adapted from kube-package's
  `fileAnalysisFieldDefs.ts`)
- Translation of LLM output JSON → `RawFileDoc` shape (Mongo) **and**
  `:File` graph node + entity relationships (Neo4j), with safe fallbacks
  for malformed responses
- Knowledge `status.state` transitions (`Processing` on start,
  `Processed` on success, `Failed` on caught error) — kept in lock-step
  between Mongo and Neo4j via a shared `transitionState` helper
- The `IngestionStrategy` pluggable abstraction — the worker delegates
  the post-clone scan/analyze/persist loop to a strategy instance.
  v1 ships one concrete: `BasicFileAnalysisStrategy`

The package does **not** own:

- The `github_pull` worker handler (deferred — the publisher exists in
  `@bb/queue` but no consumer yet)
- Folder-level summarization (out of scope per OSS strategy; future
  strategies can add this)
- Semantic chunking, big-file processing, smart sampling (future
  strategies)
- Recovery / failed-files tracking
- Progress **transport** — the package now ships a `ProgressContext`
  extension port under `src/progress/` (see that folder's README), but
  the actual SSE / Pub-Sub plumbing lives in the host binary's progress
  package. The OSS default (`nullProgressContextFactory`) discards every
  event, consistent with the no-outbound-calls posture.
- Provider abstraction (no Bitbucket support; GitHub-only)
- Concurrency control (sequential per-file processing intentional for
  v0; revisit when users complain)

## Public exports

```ts
// High-level registration (OSS standalone wires this once at boot)
function registerGithubWorkers(deps?: RegisterGithubWorkersDeps): void; // wires GithubIndex + GithubPull
function registerLocalIngestWorker(): void; // wires LocalIngest

interface RegisterGithubWorkersDeps {
  sourceFactory?: SourceFactory; // index-side hook
  pullFactory?: PullFactory; // pull-side hook (provides reader + diff + targetCommit)
  progressContextFactory?: ProgressContextFactory; // SSE progress hook (default: no-op)
}

// Lower-level building blocks (downstream consumers with their own queue
// skip registerGithubWorkers and wire these against their own registry)
function createPipelineRunner(deps: CreatePipelineRunnerDeps): IngestRunnerDeps;
function createGithubIngestHandler(deps: IngestJobHandlerDeps): (msg) => Promise<void>;
function createLocalIngestHandler(deps: IngestJobHandlerDeps): (msg) => Promise<void>;
function runPull(msg: JobMessage<GithubPullPayload>, pullFactory?: PullFactory): Promise<void>;
function reposRoot(): string;
function repoCloneDir(knowledgeId: string): string;
function metaRootFor(knowledgeId: string): string;
function metaPathsFor(knowledgeId: string): MetaPaths;
function commitMetaDir(knowledgeId: string, commitHash: string): string;
function businessContextDir(knowledgeId: string, commitHash: string, sanitizedTitle: string): string;
function orgRegistryDir(knowledgeId: string, orgId: string): string;

function createFlatFolderStrategy(deps): IngestStrategy;
function createLlmFileAnalyzer(deps): FileAnalyzer;
function createDiskSourceReader(deps): SourceReader;
```

The optional `sourceFactory` lets downstream consumers inject a custom
`SourceReader` for index jobs (no local clone). The analogous
`pullFactory` does the same for pull jobs — its result carries the
resolved `targetCommit`, the diff between currentCommit and targetCommit,
and a reader pinned at the target. When unset, both fall back to the
default disk-backed paths (`git clone` for index, `git fetch + diff +
checkout` for pull). See [docs/extension-points.md](docs/extension-points.md)
for the design rationale.

For per-job LLM credentials, downstream consumers set
`{ llmApiKey?, llmProvider?, llmModel?, llmKeyId? }` on the
`GithubIndexPayload` / `GithubPullPayload` they enqueue
(`PayloadLlmOverrides` from `@bb/types`). The runner extracts those into
`StrategyContext.llmCallContext` and every LLM call site forwards it to
`@bb/llm`. `llmProvider` is `string` (open) so multi-provider consumers
can carry richer taxonomies; the OSS LLM client narrows to
`openrouter`/`ollama` at the boundary. OSS standalone leaves the overrides
unset and falls back to `Config.OpenrouterApiKey` + `Config.LlmProvider`.

Both `register*Workers()` calls run once at `@bb/server` boot. The
worker hardcodes a single `IngestionStrategy` instance (currently
`new BasicFileAnalysisStrategy()`). Adding another strategy = new file

- change one line in `src/worker.ts`.

## Data ownership

- `~/.bytebell/repos/<knowledgeId>/` — the cloned working tree (for
  `github_index`) or the server-copied working tree (for `local_ingest`),
  persisted across job retries (clone is idempotent: `git fetch + reset`
  if `.git` exists). Never deleted automatically — `bytebell clean` per
  [docs/arch.md:157](../../docs/arch.md#L157) will own removal.
- The Knowledge document's `status.state` field — written via
  `setKnowledgeState` from `@bb/mongo` AND
  `setKnowledgeStateInGraph` from `@bb/neo4j`, kept in lock-step.
- Raw documents (one per scanned file) — written via `upsertRawFile`
  from `@bb/mongo`. Compound key `(knowledgeId, relativePath)`.
- `:File` graph nodes + `:HAS_FILE` / `:HAS_KEYWORD` / `:HAS_CLASS` /
  `:HAS_FUNCTION` / `:HAS_IMPORT_INTERNAL` / `:HAS_IMPORT_EXTERNAL` relationships — written via
  `upsertFileNode` from `@bb/neo4j`.

## Invariants

1. **Sequential per-file processing.** Intentionally degraded; one
   `upsertRawFile` per file. The small-file path issues one `askLLM`;
   the big-file path issues N (one per chunk) plus condensation calls,
   all sequential — no `Promise.all`, no concurrency cap. Revisit when
   the latency profile demands it.
2. **Clone idempotent.** Re-runs (BullMQ retries) call `git fetch` +
   `git reset --hard` in the existing dir rather than re-cloning.
   Tokens are re-injected into the remote URL each time.
3. **Token redaction.** `GitCloneError` carries the **redacted** repo
   URL (`https://user:***@host`) — the raw `gitToken` never appears in
   error messages or logs.
4. **State transition order.** `Processing` is set _before_ any clone
   work. `Processed` is set _only_ after the entire scan + analyze loop
   completes. On any thrown error, the handler best-effort sets `Failed`
   then re-throws so BullMQ records the retry.
5. **Fail-soft analysis, fail-hard infra.** A single file's LLM call
   failing falls back to an empty-analysis Raw doc and processing
   continues. In the big-file path, a single chunk failure contributes
   an empty analysis to the merge but does not stop the file; a
   condensation-call failure falls through to deterministic
   `dedupAnalyses` so the merged result is always well-formed. A clone
   failure or Mongo write failure throws and propagates to BullMQ for
   retry under the queue's `attempts: 3`.
6. **Hardcoded filters only.** No LLM-based ignore decisions in v0. The
   directory / file / extension blocklists in `scan.ts` are the only
   way files get skipped.

## External dependencies

- Node built-ins only: `node:child_process` (git), `node:fs/promises`
  (walk), `node:crypto` (sha-256), `node:path`, `node:util`
- Workspace deps: `@bb/config`, `@bb/errors`, `@bb/llm`, `@bb/mongo`,
  `@bb/neo4j`, `@bb/queue`, `@bb/types`
- System binary: **`git`** must be on the user's `PATH`. Documented in
  the project README as a runtime prerequisite.

## What is intentionally out of scope (v0)

- `github_pull` worker (`enqueueGithubPull` jobs sit in the queue until
  this lands; the existing strategy interface accepts it cleanly)
- Bitbucket / GitLab support
- GitHub API streaming mode (always shell-clone)
- Default-branch auto-detection (caller supplies `branch`; defaults to
  `"main"`)
- Concurrency control / parallel file processing
- Folder-level summaries / `repoSummary.json` / `flat-folder` strategy
- Semantic chunking (`SemanticChunker`)
- Per-chunk persistence (we persist only the merged file-level
  `FileAnalysis`; future MCP retrieval may want per-chunk Raw docs and
  `:Chunk` Neo4j nodes — non-breaking add)
- Smart file processor tiers (FULL / SMART_SAMPLE / METADATA_ONLY)
- Recovery / `ProcessingStateManager`
- Progress reporting / heartbeats
- Failed-files tracker
- Adaptive memory manager
- Comprehensive 17-field LLM analysis (we ship 9: `purpose`, `summary`,
  `businessContext`, `language`, `classes`, `functions`,
  `importsInternal`, `importsExternal`, `keywords`)
- Model escalation
- LLM-based ignore decisions
- Cost ledger (the `@bb/llm` package itself doesn't have one yet)
- Auto-cleanup of `~/.bytebell/repos/<knowledgeId>/`

## How to extend

Adding a new strategy (the primary extension point):

1. Create `src/<MyStrategy>.ts` exporting a class that
   `implements IngestionStrategy`. Its `ingest({ knowledgeId, rootDir })`
   is invoked once per job after the source files have landed at
   `rootDir`.
2. Compose any of the existing helpers — `walkRepo`, `analyzeFile`,
   `upsertRawFile`, `upsertFileNode`, `askLLM` — or do something
   completely different.
3. In `src/worker.ts`, change
   `const STRATEGY = new BasicFileAnalysisStrategy()` to your class.
   (Or, when richer wiring is needed, introduce a registry — out of
   scope for v1.)
4. Re-export from `src/index.ts` if other packages should be able to
   reference it directly.

Adding the `github_pull` worker:

1. Create `src/worker-pull.ts` with a `handleGithubPull` function:
   `git pull origin <branch>` → `git diff --name-only <prevSha>..HEAD`
   → invoke a `Strategy` (likely the same `BasicFileAnalysisStrategy`)
   over a smaller scoped subset of files → delete Raw + graph entries
   for files removed in the diff (needs `deleteRawFile` and
   `deleteFileNode` helpers in `@bb/mongo` / `@bb/neo4j`).
2. In `src/worker.ts`'s `registerGithubWorkers`, also call
   `registerWorker(JobType.GithubPull, handleGithubPull)`.
3. Update _Public exports_ / _Out of scope_ here.

Adding concurrency:

1. Pull `Config.ConcurrencyGithub` from `@bb/config` inside the
   strategy's `ingest()`.
2. Replace the `for await` loop with a bounded-parallel implementation
   (small inline `pLimit` style).
3. Document the new max-concurrency invariant.
