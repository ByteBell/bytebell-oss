# `@bb/ingest-github/src/pipeline/skip-decisions`

LLM-backed gate that decides whether to ingest a scanned file. Mirrors kube's
`StreamingFileScanner.shouldProcessUnknownExtension` but trimmed for the
single-tenant public layout.

## Decision flow

```
1. Reject if any directory segment is in SEED_DIRECTORIES (hardcoded list).
2. Reject if the filename is in SEED_FILENAMES.
3. Reject if the extension is in SEED_EXTENSIONS (kube's known-bad list).
4. Reject if the filename matches any glob in SEED_GLOBS (e.g. *.tfvars, .env.*).
5. Accept if the extension is in KNOWN_LANGUAGE_EXTENSIONS (fast-path, no LLM).
6. Cache lookup by `extensions:<ext>` (or `filenames:<name>` when extensionless).
7. Cache miss → askYesNoLLM with the first N chars of the file content.
8. Persist verdict to ~/.bytebell/llmDecisions.json. LLM failure → reject + cache the rejection.
```

## Files

- `seed.ts` — loads the four bundled JSON files (directory/filename/pattern/extension lists)
  at module-init time via static `import ... with { type: "json" }`. Exposes
  `SEED_DIRECTORIES`, `SEED_FILENAMES`, `SEED_EXTENSIONS`, `SEED_GLOBS`,
  `KNOWN_LANGUAGE_EXTENSIONS`, and `matchesAnyGlob`. Compiles globs once and
  caches the resulting `RegExp` for reuse.
- `cache.ts` — load/save `~/.bytebell/llmDecisions.json` with atomic write
  (write-tmp + fsync + rename + mode 0600). Mirror's kube's JSON shape so
  users can hand-edit `ignore: true → false` to permanently un-ignore an
  extension.
- `prompts/skip-decision.ts` — verbatim port of kube's YES/NO system
  prompt + user-prompt builder. Lives under `prompts/` to match the
  convention used by `strategies/flat-folder/prompts/`.
- `decider.ts` — `makeSkipDecider(deps)` returns a `SkipDecider` (port type
  from `src/types/pipeline.ts`). Reads `Config.SkipDecisionEnabled` once at
  factory time; when disabled the decider degrades to "accept everything
  past the static blocklist".
- `seed-data/` — the five JSON files copied from kube's `shared/`:
  `directoryIgnore.json`, `filenameIgnore.json`, `ignorePatterns.json`,
  `extensions.json`, `llmDecisionsBase.json`. `llmDecisionsBase.json` is
  currently unused by the runtime but kept here for reference; a future
  enhancement may pre-seed the cache file from it on first install.

## Imports allowed

- Sibling files in this folder may import each other.
- Down: `src/types/pipeline.ts`.
- Up: `@bb/config`, `@bb/types`, `@bb/llm`, `@bb/logger`, `node:*`.
- Forbidden: importing from `../scan.ts`, `../filters.ts`, `../../strategies/*`.

## Invariants

- The static (steps 1-5) and cached (step 6) paths must not perform I/O
  beyond reading the cache file once at factory time. Only the LLM branch
  reads file content from disk, and even that is bounded by
  `Config.SkipDecisionMaxCharsForLlm`.
- Every LLM verdict is flushed to disk immediately so a crash mid-scan does
  not lose decisions made earlier in the run.
- LLM failure defaults to reject and caches the rejection — matches kube's
  one-shot-rule behavior. Users can hand-edit the cache to revisit.
- The decider is process-local: tests may construct one with `cachePath`
  pointing at a temp file to avoid touching the real `~/.bytebell/`.
