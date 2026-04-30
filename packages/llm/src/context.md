# `@bb/llm/src` — context

Implementation of `@bb/llm`. See [../context.md](../context.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — public re-exports. The only entry point other
  packages may import. Exposes `askLLM` and the `AskLlmOptions` type.
  Anything not re-exported here is internal.
- **[client.ts](client.ts)** — the `askLLM` implementation. Reads
  `Config.OpenrouterApiKey` + `Config.OpenrouterModel` via `@bb/config`,
  builds the `messages` array (optional system prompt + user prompt),
  POSTs to OpenRouter via Bun's built-in `fetch` with an AbortController
  timeout, parses the typed `OpenRouterResponse`, returns the first
  choice's content. Throws `LlmConfigError` if the API key is empty,
  `LlmError` on timeout / HTTP non-2xx / empty completion.

## Module dependency graph

```
client.ts → @bb/config (getConfigValue), @bb/types (Config),
            @bb/errors (LlmConfigError, LlmError)
            (built-in: fetch, AbortController, setTimeout)
index.ts  → re-exports the public surface from client.ts
```

No cycles, no intra-package leaves yet — `client.ts` is the only
implementation file.

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
