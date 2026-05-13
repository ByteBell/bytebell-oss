# `@bb/ingest-github/src/adapters`

Adapters that bridge the strategy to external systems. Today: the LLM file
analyzer that wraps `@bb/llm`'s `askJsonLLM` and shapes the JSON response into
the canonical `FileAnalysis` shape (extended kube field set).

## Tier

Domain.

## Files

- `llm-file-analyzer.ts` — `createLlmFileAnalyzer(deps)` returns the
  `FileAnalyzer` port. Deps inject `buildSystemPrompt` and `buildUserPrompt` so
  the prompts live in `strategies/flat-folder/prompts/` (one-way tier flow
  from strategies → adapters via DI, never via import). Also exports
  `shapeAnalysis` (raw JSON → `FileAnalysis`, tolerates missing keys) and
  `languageFromPath` (extension-based fallback when the LLM omits `language`).
- `index.ts` — barrel.

## Invariants

- The adapter trusts nothing from the LLM. Every string field defaults to `""`,
  every array to `[]`. Missing-key tolerance is intentional — the schema
  evolves and old cached responses must still parse.
- The adapter never throws on a bad LLM response. It logs at WARN and returns
  `{ language: "unknown", analysis: emptyFileAnalysis() }`. Strategy code
  decides what to do with empty analyses (still produces a `:File` node).
- The adapter does not own prompts. Prompts live in the strategy that uses
  them; the strategy passes prompt-builders in.
