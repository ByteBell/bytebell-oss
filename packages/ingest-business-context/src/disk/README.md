# `disk/` — context

Persists business-context artefacts under
`metaRoot/commits/<commitHash>/business-context/<sanitizedTitle>/`. Paths come
from `@bb/ingest-github`'s `businessContextDir()` — this folder never builds
its own paths.

| File                | Responsibility                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| `sanitize-title.ts` | LLM title → kebab-case filesystem-safe slug (≤80 chars). Also the Neo4j nodeId. |
| `save-original.ts`  | Writes `original.txt` (raw user-authored text, mode 0600).                      |
| `save-analysis.ts`  | Wraps the analysis in a metadata envelope and writes `analysis.json`.           |
| `load-cached.ts`    | Reads back a saved envelope; tolerant of missing / malformed files.             |

Cache key is the sanitized title alone. Two BC submissions whose LLM titles
sanitise to the same slug share the same cached analysis (intentional — same
idea, same node).
