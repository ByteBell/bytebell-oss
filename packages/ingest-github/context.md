# `@bb/ingest-github` — context

## Tier

Domain. Depends on Kernel (`@bb/types`, `@bb/errors`), Infrastructure
(`@bb/config`, `@bb/mongo`), Cross-cutting (`@bb/llm`), and Strategy
(`@bb/queue`). May be imported by Binaries (`@bb/server` calls
`registerGithubWorkers()` once at boot). Never by `@bb/cli`.

## Responsibility

Consumes `JobType.GithubIndex` jobs published by `@bb/queue`'s
`enqueueGithubIndex`, runs a deliberately minimal "very basic file
analysis" strategy per repo, and persists results to Mongo via
`@bb/mongo`.

The package owns:

- The `github_index` worker handler (registered via
  `@bb/queue.registerWorker`)
- The git clone / fetch lifecycle for one repo per knowledge ID, kept on
  disk under `~/.bytebell/repos/<knowledgeId>/` for future `git_pull`
- The hardcoded ignore list (directories, lockfiles, binary extensions,
  size cap) for repo scanning
- The 7-field per-file LLM analysis prompt
- Translation of LLM output JSON → `RawFileDoc` shape, with safe
  fallbacks for malformed responses
- Knowledge `status.state` transitions (`Processing` on start,
  `Processed` on success, `Failed` on caught error)

The package does **not** own:

- The `github_pull` worker handler (deferred — the publisher exists in
  `@bb/queue` but no consumer yet)
- Folder-level summarization (out of scope per OSS strategy)
- Semantic chunking, big-file processing, smart sampling
- Neo4j writes (no `@bb/neo4j` / `@bb/graph` packages exist)
- Recovery / progress reporting / failed-files tracking
- Provider abstraction (no Bitbucket support; GitHub-only)
- Concurrency control (sequential per-file processing intentional for
  v0; revisit when users complain)

## Public exports

```ts
function registerGithubWorkers(): void;
```

That is the entire public surface. Calling it once at server boot wires
the `github_index` BullMQ worker via `@bb/queue.registerWorker`. The
caller is `@bb/server` (out of scope for this PR).

## Data ownership

- `~/.bytebell/repos/<knowledgeId>/` — the cloned working tree,
  persisted across job retries (clone is idempotent: `git fetch + reset`
  if `.git` exists). Never deleted automatically — `bytebell clean` per
  [docs/arch.md:157](../../docs/arch.md#L157) will own removal.
- The Knowledge document's `status.state` field — written via
  `setKnowledgeState` from `@bb/mongo`.
- Raw documents (one per scanned file) — written via `upsertRawFile`
  from `@bb/mongo`. Compound key `(knowledgeId, relativePath)`.

## Invariants

1. **Sequential per-file processing.** Intentionally degraded; one
   `askLLM` + one `upsertRawFile` per file. No `Promise.all`, no
   concurrency cap. Revisit when the latency profile demands it.
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
   continues. A clone failure or Mongo write failure throws and propagates
   to BullMQ for retry under the queue's `attempts: 3`.
6. **Hardcoded filters only.** No LLM-based ignore decisions in v0. The
   directory / file / extension blocklists in `scan.ts` are the only
   way files get skipped.

## External dependencies

- Node built-ins only: `node:child_process` (git), `node:fs/promises`
  (walk), `node:crypto` (sha-256), `node:path`, `node:util`
- Workspace deps: `@bb/config`, `@bb/errors`, `@bb/llm`, `@bb/mongo`,
  `@bb/queue`, `@bb/types`
- System binary: **`git`** must be on the user's `PATH`. Documented in
  the project README as a runtime prerequisite.

## What is intentionally out of scope (v0)

- `github_pull` worker (`enqueueGithubPull` jobs sit in the queue until
  this lands)
- Bitbucket / GitLab support
- GitHub API streaming mode (always shell-clone)
- Default-branch auto-detection (caller supplies `branch`; defaults to
  `"main"`)
- Concurrency control / parallel file processing
- Folder-level summaries / `repoSummary.json` / `flat-folder` strategy
- Semantic chunking (`SemanticChunker`)
- Big-file handling (>1 MB files are skipped, not chunked)
- Smart file processor tiers (FULL / SMART_SAMPLE / METADATA_ONLY)
- Recovery / `ProcessingStateManager`
- Progress reporting / heartbeats
- Failed-files tracker
- Adaptive memory manager
- Comprehensive 17-field LLM analysis (we ship 7: `purpose`, `summary`,
  `language`, `classes`, `functions`, `imports`, `keywords`)
- Model escalation
- LLM-based ignore decisions
- Cost ledger (the `@bb/llm` package itself doesn't have one yet)
- Auto-cleanup of `~/.bytebell/repos/<knowledgeId>/`

## How to extend

Adding the `github_pull` worker:

1. Create `src/worker-pull.ts` with a `handleGithubPull` function:
   `git pull origin <branch>` → `git diff --name-only <prevSha>..HEAD`
   → re-analyze only changed files via `analyzeFile` → `upsertRawFile`
   → delete Raw docs for files removed in the diff (needs a
   `deleteRawFile(knowledgeId, relativePath)` helper in `@bb/mongo`).
2. In `src/worker.ts`'s `registerGithubWorkers`, also call
   `registerWorker(JobType.GithubPull, handleGithubPull)`.
3. Update _Public exports_ / _Out of scope_ here.

Adding concurrency:

1. Pull `Config.ConcurrencyGithub` from `@bb/config` inside the worker.
2. Replace the `for await` loop with a bounded-parallel implementation
   (small inline `pLimit` style).
3. Document the new max-concurrency invariant.
