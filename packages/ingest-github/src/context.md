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
  Defines `IngestionContext { knowledgeId, rootDir, priorShas? }` and
  `IngestionStrategy { name, ingest(ctx) }`. `priorShas` is the
  `relativePath → sha` map of the previously-indexed tree; absent on
  full-index runs, populated by the pull worker for diff mode. The
  result includes `filesAnalyzed` (LLM ran), `filesSkipped` (sha
  matched, work skipped), and `seenPaths` (every path the scanner
  yielded — used by callers to compute deletions).
- **[BasicFileAnalysisStrategy.ts](BasicFileAnalysisStrategy.ts)** —
  the v1 default strategy. Two modes share the same per-file pipeline
  (`analyzeFile → upsertRawFile → upsertFileNode`):
  - **Full mode** (`priorShas === undefined`): single walk; analyses
    every file. Used by initial index and local ingest.
  - **Diff mode** (`priorShas` supplied): walk once, compute each
    file's content sha, eagerly skip when `priorShas.get(path) === sha`,
    buffer the changed subset, then seed
    `updateKnowledgeProgress(0, changed.length)` so the CLI progress
    bar denominates against actual work and only run analyse + upsert
    on the changed subset.
- **[worker.ts](worker.ts)** — BullMQ handlers and the strategy
  selector. Module-scoped `STRATEGY: IngestionStrategy = new
BasicFileAnalysisStrategy()` — swap this line to switch strategies.
  Three handlers compose the strategy:
  - `handleGithubIndex(msg)` — `transitionState(Processing)` →
    `ensureReposRoot` + `gitClone` → `readCommitHash` (hard error on
    `"unknown"`; future pulls cannot diff without a SHA anchor) →
    `STRATEGY.ingest` (full mode) → `persistStats` →
    `setKnowledgeCommit` (errors bubble — silent failure here would
    leave `commitHashes` unset and break every future pull) →
    `transitionState(Processed)`.
  - `handleGithubPull(msg)` — `getKnowledge` → `gitClone` →
    `readCommitHash`; bails when HEAD is already in `commitHashes`.
    Otherwise: snapshots prior `:File` set into
    `:FileVersion(previousCommitId)`, builds `priorShas` via
    `listRawFileShas`, runs `STRATEGY.ingest` in diff mode, computes
    `deletedPaths = priorShas.keys() − result.seenPaths` and calls
    `deleteRawFiles` + `deleteFileNodes` for them, then
    `setKnowledgeCommit` + `transitionState(Processed)`.
  - `handleLocalIngest(msg)` — `transitionState(Processing)` →
    `STRATEGY.ingest` (full mode; files already on disk) →
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
- **[analyze.ts](analyze.ts)** — public entry: `analyzeFile(relativePath,
content)` returns `{ language, analysis, usage }`. Routes per file by
  `tokenLen(content)`: above `BIG_FILE_TOKEN_THRESHOLD` →
  `analyzeBigFile`; otherwise builds the 9-field prompt by
  interpolating `FILE_ANALYSIS_FIELDS_BLOCK` (`purpose`, `summary`,
  `businessContext`, `language`, `classes`, `functions`,
  `importsInternal`, `importsExternal`, `keywords`), calls `askLLM`,
  strips fences, parses, validates each field via
  `parseFileAnalysisJson`, falls back to `emptyAnalysis()` on any
  LLM/parse failure (no retry — BullMQ handles whole-job retry).
  Language is taken verbatim from the LLM's `language` field; on LLM
  failure, parse failure, or missing/empty value, falls back to
  `"unknown"`. Content is **not** truncated — the big-file path handles
  oversized inputs without losing data.
- **[bigFile.ts](bigFile.ts)** — `analyzeBigFile(relativePath, content)`
  for files above the token threshold. Splits content into strictly
  line-aligned chunks honoring `MAX_TOKENS_PER_CHUNK` (a line whose own
  tokens exceed the limit becomes its own oversize chunk — no mid-line
  splitting; mirrors kube-package's `splitByTokens`). Calls `askLLM`
  once per chunk with a chunk-aware variant of the same
  `FILE_ANALYSIS_FIELDS_BLOCK` prompt (only the preamble differs), then
  merges chunk results: ≤ `SMALL_FILE_DEDUP_THRESHOLD` chunks →
  deterministic `dedupAnalyses` (unions both `importsInternal` and
  `importsExternal` independently; no extra LLM call); larger →
  `condenseRecursively` map-reduce. The condense prompt re-uses
  `FILE_ANALYSIS_FIELDS_BLOCK` for definitions and appends a separate
  merge-rules block (drawn from kube-package's `CONDENSE_FIELD_RULES`).
  Fits as many partial analyses as possible into a single `askLLM`
  condensation call (bounded by `CONDENSE_CONTEXT_LIMIT`), batches when
  oversized, and recurses on batch results until one analysis remains.
  Per-chunk and condensation failures fall through to `dedupAnalyses`
  so the recursion always terminates with a well-formed result. All
  LLM token usages are summed into a single `AskLlmUsage` (same model
  end-to-end). Sequential per chunk and per batch — matches the
  package's per-file sequential invariant.
- **[analysisShared.ts](analysisShared.ts)** — module-scoped constants
  (`FALLBACK_LANGUAGE`, `BIG_FILE_TOKEN_THRESHOLD`,
  `MAX_TOKENS_PER_CHUNK`, `CONDENSE_CONTEXT_LIMIT`,
  `CONDENSE_PROMPT_OVERHEAD`, `SMALL_FILE_DEDUP_THRESHOLD`), helpers
  shared by `analyze.ts` and `bigFile.ts` (`tokenLen` re-exported from
  `@bb/llm`, backed by `tiktoken` with `cl100k_base`; `tryParse`,
  `stringArray`, `emptyAnalysis`, `parseFileAnalysisJson`), and the
  `FILE_ANALYSIS_FIELDS_BLOCK` string constant — the **single source
  of truth** for the 9-field definitions used verbatim across all
  three prompts (small-file, chunk, condense). Field wording adapted
  from kube-package's [fileAnalysisFieldDefs.ts](file:///Users/deadbytes/Documents/ByteBell/kube-package/services/knowledge-server/repo/src/knowledge/github/versions/v2/fileAnalysisFieldDefs.ts);
  `language` is the one explicit deviation (we ask the LLM, kube
  derives from extension).

## Module dependency graph

```
paths.ts                       → @bb/config, node:fs/promises, node:path
clone.ts                       → @bb/errors, node:child_process, node:fs/promises,
                                 node:path, node:util
scan.ts                        → node:fs/promises, node:path
analysisShared.ts              → @bb/mongo (FileAnalysis type)
analyze.ts                     → @bb/llm, @bb/mongo (FileAnalysis type),
                                 analysisShared.ts, bigFile.ts
bigFile.ts                     → @bb/llm, @bb/mongo (FileAnalysis type),
                                 analysisShared.ts
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
