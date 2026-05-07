# `@bb/ingest-github/src` — context

Implementation of `@bb/ingest-github`. See [../context.md](../context.md)
for the package-level contract; this file documents how the source tree is
split.

## Files

- **[index.ts](index.ts)** — public re-exports. Re-exports
  `registerGithubWorkers`, `registerLocalIngestWorker`,
  `IngestionStrategy` / `IngestionContext` types, and
  `BasicFileAnalysisStrategy`. Anything else is internal.
- **[Strategy.ts](Strategy.ts)** — the extension-point interface.
  Defines `IngestionContext { knowledgeId, rootDir }` and
  `IngestionStrategy { name, ingest(ctx) }`. Future contributors
  implement this to add alternative strategies (flat-folder summaries,
  semantic chunking, etc.).
- **[BasicFileAnalysisStrategy.ts](BasicFileAnalysisStrategy.ts)** —
  the v1 default strategy. Iterates `walkRepo(rootDir)`; per file,
  calls `analyzeFile(relativePath, content)` for the 7-field LLM
  analysis, computes a sha-256, then dual-writes:
  - `upsertRawFile` to Mongo's `raw` collection
  - `upsertFileNode` to Neo4j (creates `:File` + clears stale
    `:HAS_KEYWORD / :HAS_CLASS / :HAS_FUNCTION / :HAS_IMPORT` rels +
    re-attaches fresh ones).
- **[worker.ts](worker.ts)** — BullMQ handlers and the strategy
  selector. Module-scoped `STRATEGY: IngestionStrategy = new
BasicFileAnalysisStrategy()` — swap this line to switch strategies.
  Two handlers compose the strategy:
  - `handleGithubIndex(msg)` — `transitionState(Processing)` →
    `ensureReposRoot` + `gitClone` → `STRATEGY.ingest` →
    `transitionState(Processed)`.
  - `handleLocalIngest(msg)` — `transitionState(Processing)` →
    `STRATEGY.ingest` (files already on disk) →
    `transitionState(Processed)`.

  `transitionState` writes to both Mongo (`setKnowledgeState`) and
  Neo4j (`setKnowledgeStateInGraph`, best-effort: failures swallowed
  so a Neo4j hiccup doesn't fail the whole job). On exception:
  best-effort `Failed` transition then re-throw inside `IngestError`
  whose `message` embeds the underlying cause's message so BullMQ's
  `failedReason` is diagnostic.

- **[paths.ts](paths.ts)** — pure helpers: `reposRoot()` returns
  `<bytebell-home>/repos`; `repoCloneDir(knowledgeId)` returns the
  per-knowledge subdirectory; `ensureReposRoot()` mkdirs with mode
  `0o700`.
- **[clone.ts](clone.ts)** — `gitClone({ repoUrl, branch, destDir,
gitToken? })`. Delegates to `node:child_process.execFile` (no shell,
  no injection risk). Idempotent: if `<destDir>/.git` is a directory,
  runs `git remote set-url origin <authedUrl>` + `git fetch
--depth=1 origin <branch>` + `git reset --hard origin/<branch>`.
  New clones use `--depth=1 --single-branch --branch <branch>`. Token
  injection via `URL.username` / `URL.password = "x-oauth-basic"`. All
  failures wrapped in `GitCloneError` (which redacts userinfo in URL).
- **[scan.ts](scan.ts)** — async generator `walkRepo(rootDir)` yielding
  `ScannedFile` records. Hardcoded filters: skipped directories
  (`.git`, `node_modules`, `dist`, `build`, `.next`, `.turbo`,
  `.cache`, `coverage`, `.bytebell`); skipped filenames (`.DS_Store`,
  lockfiles); binary-extension blocklist; size cap of 1 MB; null-byte
  heuristic on the first 4 KB as final UTF-8 sanity check. Constant
  memory — `node:fs/promises.opendir` recursive descent.
- **[analyze.ts](analyze.ts)** — `analyzeFile(relativePath, content)`
  returns `{ language, analysis }`. Builds the 7-field stripped prompt,
  calls `askLLM`, strips fences, parses, validates each field, falls
  back to `emptyAnalysis()` on any LLM/parse failure (no retry — BullMQ
  handles whole-job retry). Language is taken verbatim from the LLM's
  `language` field; on LLM failure, parse failure, or missing/empty
  value, falls back to `"unknown"`. Content truncated at 60 KB before
  prompting.

## Module dependency graph

```
paths.ts                       → @bb/config, node:fs/promises, node:path
clone.ts                       → @bb/errors, node:child_process, node:fs/promises,
                                 node:path, node:util
scan.ts                        → node:fs/promises, node:path
analyze.ts                     → @bb/llm, @bb/mongo (FileAnalysis type)
Strategy.ts                    → (leaf — type-only, no imports)
BasicFileAnalysisStrategy.ts   → @bb/mongo (upsertRawFile),
                                 @bb/neo4j (upsertFileNode),
                                 scan.ts, analyze.ts, Strategy.ts,
                                 node:crypto
worker.ts                      → @bb/types, @bb/mongo (setKnowledgeState),
                                 @bb/neo4j (setKnowledgeStateInGraph),
                                 @bb/queue (registerWorker),
                                 @bb/errors (IngestError),
                                 paths.ts, clone.ts,
                                 BasicFileAnalysisStrategy.ts, Strategy.ts
index.ts                       → re-exports the public surface
```

No cycles. `Strategy.ts` is the abstraction root that
`BasicFileAnalysisStrategy.ts` and `worker.ts` both import.

## Invariants enforced here

- **Strategy slot is single + module-scoped.** Only one strategy is
  active at a time per `worker.ts` module — swap by editing the line
  `const STRATEGY: IngestionStrategy = new BasicFileAnalysisStrategy()`.
  Future PR may add a config-driven selector; for v1 the slot is code.
- **State transitions are explicit and dual-written.** `Processing` is
  set _before_ any clone work; `Processed` is the last action on the
  success path; `Failed` is best-effort on the failure path. Each
  transition writes to Mongo (load-bearing) AND Neo4j (best-effort —
  failures swallowed so a Neo4j hiccup doesn't fail the whole job).
- **Per-file fallback never throws.** `analyzeFile` always returns a
  well-formed `AnalyzedFile`; LLM/parse failures collapse to an
  `emptyAnalysis()` and the loop persists Raw docs + Neo4j nodes with
  empty analysis fields.
- **Idempotent re-runs.** `gitClone` detects an existing `.git` and
  `fetch + reset` instead of cloning. `upsertRawFile` is upsert-by
  `(knowledgeId, relativePath)`. `upsertFileNode` clears + re-attaches
  Neo4j relationships. BullMQ retries are correct (slow but safe).
- **No env reads anywhere.** Repo path comes from `@bb/config`'s
  `getBytebellHome()`; OpenRouter creds come from `@bb/llm`. No
  `process.env` references in this package.
- **Token redaction at the error boundary.** `GitCloneError` redacts
  the URL's userinfo. The token is also stripped from the message via
  the `redactUrl` helper in `@bb/errors/src/ingest-errors.ts`.
- **Filters are hardcoded, not pluggable.** v0 ships a fixed
  `SKIP_DIRS` / `SKIP_FILES` / `BINARY_EXTENSIONS` / size cap.
- **`IngestError.message` embeds the underlying cause.** When the
  worker re-throws, the cause's message is interpolated so BullMQ's
  serialized `failedReason` surfaces the actual git/LLM/Mongo error
  rather than just `"github_index handler failed"`.

## Adding a worker / strategy / helper

Follow the recipes in [../context.md](../context.md) under _How to
extend_. New files live as flat `src/<name>.ts` (the repo ESLint rule
forbids parent traversal — keep `src/` flat). `worker-pull.ts` is the
expected next file when `github_pull` lands.
