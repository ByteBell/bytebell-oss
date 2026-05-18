# `llm/` — context

LLM-driven analysis. All calls flow through `@bb/llm` (`askJsonLLM`). Per-job
overrides (apiKey, provider, model) come in via the worker payload and are
applied here.

| File                   | Responsibility                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `enrichment-reader.ts` | Reads optional org-level registries and repo-summary from disk. Tolerant of missing files. |
| `enrichment-format.ts` | Renders enrichment data into a per-focus prompt section with a token cap.                  |
| `call-builder.ts`      | Composes one analysis call (system+user) and trims enrichment if over budget.              |
| `merge.ts`             | Merges three partial blobs into one fully-populated `BusinessContextAnalysis`.             |
| `title.ts`             | Title-generation call. Returns the fallback "Untitled Business Context" on null.           |
| `analyze-parallel.ts`  | Runs the 3 analysis calls concurrently and merges results.                                 |

The package never imports OpenAI / Anthropic SDKs. Only `@bb/llm`.
