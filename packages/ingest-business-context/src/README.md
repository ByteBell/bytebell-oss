# `@bb/ingest-business-context/src` — implementation map

See [../README.md](../README.md) for the package contract.

## Layout

```
src/
  README.md
  index.ts                 Public barrel
  field-defs.ts            16-field analysis schema (single source of truth)
  types.ts                 Input / output / metadata interfaces
  errors.ts                CommitNotIndexedError, BusinessContextAnalysisFailedError

  prompt/                  System + user prompt builders (title, analysis, user-message)
  disk/                    Disk persistence (sanitize-title, save-original, save-analysis, load-cached)
  llm/                     Enrichment-reader, enrichment-format, call-builder, merge, title, analyze-parallel
  neo4j/                   Indexes, relationship-types, serialize, write-node, write-version, write-keywords
  strategy/                commit-validator, execute, store-graph
  worker/                  handler, register
```

## Import rules

- Cross-folder within the package → `src/folder/file.ts`.
- Sibling within the same folder → `./file.ts`.
- Cross-package → `@bb/foo`.
- **Never** `../` parent traversal.

## Module-graph rules

- `disk/**` depends only on `node:fs`, `@bb/ingest-github` (paths), `@bb/logger`, and `src/types.ts`.
- `llm/**` depends only on `@bb/llm`, `@bb/logger`, `@bb/ingest-github` (paths), and `src/prompt/`, `src/field-defs.ts`, `src/types.ts`.
- `neo4j/**` depends only on `@bb/neo4j`, `@bb/logger`, and `src/types.ts`.
- `strategy/**` depends on `disk/`, `llm/`, `neo4j/`, `src/errors.ts`, `@bb/ingest-github` (paths), `@bb/logger`, `@bb/neo4j`.
- `worker/**` depends on `strategy/`, `@bb/queue`, `@bb/types`, `@bb/config`, `@bb/logger`.
- No layer skips another. The public API (`index.ts`) re-exports from each layer.
