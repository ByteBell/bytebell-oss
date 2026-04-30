# `@bb/ingest-github/src` — context

Implementation of `@bb/ingest-github`. See [../context.md](../context.md)
for the package-level contract; this file documents how the source tree is
split.

## Files

- **[index.ts](index.ts)** — public re-exports. Single line: re-exports
  `registerGithubWorkers` from `worker.ts`. Anything else is internal.
- **[worker.ts](worker.ts)** — the BullMQ handler:
  `handleGithubIndex(msg)`. Composes `setKnowledgeState` →
  `ensureReposRoot` + `gitClone` → `walkRepo` → per-file
  (`analyzeFile` + `upsertRawFile`) → `setKnowledgeState(Processed)`.
  On thrown errors: best-effort `setKnowledgeState(Failed)` then wraps
  in `IngestError(knowledgeId, …, cause)` and re-throws for BullMQ.
  Uses `node:crypto.createHash` for the per-file sha-256.
- **[paths.ts](paths.ts)** — pure helpers: `reposRoot()` returns
  `<bytebell-home>/repos`; `repoCloneDir(knowledgeId)` returns the
  per-knowledge subdirectory; `ensureReposRoot()` mkdirs with mode
  `0o700`. No I/O outside `ensureReposRoot`.
- **[clone.ts](clone.ts)** — `gitClone({ repoUrl, branch, destDir,
gitToken? })`. Delegates to `node:child_process.execFile` (no shell,
  no injection risk). Idempotent: if `<destDir>/.git` is a directory,
  runs `git remote set-url origin <authedUrl>` + `git fetch
--depth=1 origin <branch>` + `git reset --hard origin/<branch>`. New
  clones use `--depth=1 --single-branch --branch <branch>`. Token
  injection via `URL.username` / `URL.password = "x-oauth-basic"`.
  All failures wrapped in `GitCloneError` (which itself redacts userinfo
  in the URL).
- **[scan.ts](scan.ts)** — async generator `walkRepo(rootDir)` yielding
  `ScannedFile` records. Hardcoded filters: skipped directories (`.git`,
  `node_modules`, `dist`, `build`, `.next`, `.turbo`, `.cache`,
  `coverage`, `.bytebell`); skipped filenames (`.DS_Store`, lockfiles);
  binary-extension blocklist; size cap of 1 MB; null-byte heuristic on
  the first 4 KB of every file as a final UTF-8 sanity check. Constant
  memory — `node:fs/promises.opendir` recursive descent.
- **[analyze.ts](analyze.ts)** — `analyzeFile(relativePath, content)`
  returns `{ language, analysis }`. Builds the 7-field stripped prompt,
  calls `askLLM`, strips fences, parses, validates each field with
  `stringArray` / typeof checks, falls back to
  `emptyAnalysis()` on any LLM or parse failure (no retry — BullMQ
  handles whole-job retry). Language detection via
  `EXTENSION_LANGUAGE` map with `dockerfile` special-case and
  `plaintext` ultimate fallback. Content truncated at 60 KB before
  prompting (defensive; `scan.ts` already enforces 1 MB).

## Module dependency graph

```
paths.ts    → @bb/config (getBytebellHome), node:fs/promises, node:path
clone.ts    → @bb/errors (GitCloneError), node:child_process, node:fs/promises,
              node:path, node:util
scan.ts     → node:fs/promises, node:path
analyze.ts  → @bb/llm (askLLM), @bb/mongo (FileAnalysis type), node:path
worker.ts   → @bb/types (JobType, KnowledgeState, GithubIndexPayload, JobMessage),
              @bb/mongo (setKnowledgeState, upsertRawFile),
              @bb/queue (registerWorker), @bb/errors (IngestError),
              paths.ts, clone.ts, scan.ts, analyze.ts, node:crypto
index.ts    → re-exports the public surface from worker.ts
```

No cycles. `worker.ts` is the orchestrator; the other modules are leaves
or one-deep helpers.

## Invariants enforced here

- **State transitions are explicit.** `Processing` is set _before_ any
  clone work; `Processed` is the last action on the success path;
  `Failed` is best-effort on the failure path (the catch awaits
  `setKnowledgeState(Failed).catch(() => undefined)` so a Mongo failure
  during cleanup doesn't mask the real cause).
- **Per-file fallback never throws.** `analyzeFile` always returns a
  well-formed `AnalyzedFile`; LLM/parse failures collapse to an
  `emptyAnalysis()` and the loop persists a Raw doc with empty analysis
  fields. This isolates whole-job failure to infra (clone, Mongo) rather
  than per-file LLM hiccups.
- **Idempotent re-runs.** `gitClone` detects an existing `.git` directory
  and `fetch + reset` instead of cloning. `upsertRawFile` is
  upsert-by-`(knowledgeId, relativePath)`. Re-driving the same job from
  BullMQ's retry path is correct (slow but safe).
- **No env reads anywhere.** Repo path comes from `@bb/config`'s
  `getBytebellHome()`; OpenRouter creds come from `@bb/llm`. No
  `process.env` references in this package.
- **Token redaction at the error boundary.** `GitCloneError` redacts the
  URL's userinfo. The token is also stripped from the message via the
  `redactUrl` helper in `@bb/errors/src/ingest-errors.ts`.
- **Filters are hardcoded, not pluggable.** v0 ships a fixed
  `SKIP_DIRS` / `SKIP_FILES` / `BINARY_EXTENSIONS` / size cap. No LLM
  ignore decisions, no config-driven overrides.

## Adding a worker / helper

Follow the recipes in [../context.md](../context.md) under _How to
extend_. New files live as flat `src/<name>.ts` (the repo ESLint rule
forbids parent traversal — keep `src/` flat). `worker-pull.ts` is the
expected next file when `github_pull` lands.
