# `@bb/llm/src` — context

Implementation of `@bb/llm`. See [../context.md](../context.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — public re-exports. The only entry point other
  packages may import. Exposes `askLLM` and the `AskLlmOptions` type.
  Anything not re-exported here is internal.
- **[client.ts](client.ts)** — the `askLLM` implementation. Reads
  `Config.OpenrouterApiKey`, the primary `Config.OpenrouterModel`, and
  the four fallback slots `Config.OpenrouterFallbackModel1..4` via
  `@bb/config`. Builds the deduplicated chain `[primary, ...nonEmpty
(slot1..4)]`; if the chain has ≥2 entries the request body includes a
  `models: [...]` array so OpenRouter routes among them natively. Builds
  the `messages` array (optional system prompt + user prompt), POSTs to
  OpenRouter via Bun's built-in `fetch` with an AbortController timeout,
  parses the typed `OpenRouterResponse`, returns the first choice's
  content. `usage.model` reflects which model OpenRouter actually
  routed to. Throws `LlmConfigError` if the API key is empty, `LlmError`
  on timeout / HTTP non-2xx / empty completion.
- **[tokenizer.ts](tokenizer.ts)** — `tokenLen`, `encodeTokens`,
  `decodeTokens`. Module-cached `tiktoken` encoder using `cl100k_base`,
  lazy-initialized via `get_encoding`. All three helpers fall back to
  char/4 (`tokenLen`) or empty result (`encodeTokens` / `decodeTokens`)
  if the WASM init fails — pipeline keeps running even on exotic Bun
  builds.
- **[pricing.ts](pricing.ts)** — `estimateCostUsd` and
  `estimateCostFromBreakdown`. One-shot fetch of OpenRouter's
  `/api/v1/models` (cached for the process lifetime).

## Module dependency graph

```
client.ts    → @bb/config (getConfigValue), @bb/types (Config),
               @bb/errors (LlmConfigError, LlmError)
               (built-in: fetch, AbortController, setTimeout)
tokenizer.ts → tiktoken (npm: get_encoding, Tiktoken type)
pricing.ts   → @bb/config, @bb/types
index.ts     → re-exports the public surface from client.ts,
               tokenizer.ts, pricing.ts
```

No cycles. Each implementation file owns one concern (HTTP, tokens,
pricing).

## Invariants enforced here

- **No module state.** `askLLM` constructs a fresh request per call; no
  caching, no shared client, no memoization. Tests need no reset hook.
- **Timeout is honored.** AbortController fires at `timeoutMs`; the
  `clearTimeout` call lives in a `finally` so the timer is always
  cleared regardless of fetch outcome.
- **Errors carry typed metadata.** `LlmConfigError` carries the
  `bytebell keys set` hint; `LlmError` accepts an optional `cause` and
  composes a single-line message capped at 500 chars of any HTTP error
  body (so the logger doesn't blow up on multi-MB error responses).
- **No env reads.** Only `getConfigValue(Config.OpenrouterApiKey)` /
  `getConfigValue(Config.OpenrouterModel)` provide secrets/config.
- **Empty completions are errors.** A 200 OK with no `choices[0].message
.content` throws `LlmError("OpenRouter returned empty completion")` —
  do not silently return an empty string.

## Adding a helper

Follow the recipes in [../context.md](../context.md) under _How to
extend_. New files live as flat `src/<name>.ts` (the repo ESLint rule
forbids parent traversal — keep `src/` flat).
