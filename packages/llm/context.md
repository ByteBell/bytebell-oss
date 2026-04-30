# `@bb/llm` — context

## Tier

Cross-cutting. Depends on Kernel (`@bb/types` for `Config`, `@bb/errors`
for typed error classes) and Infrastructure (`@bb/config` for the
OpenRouter API key + model). May be imported by Domain (`@bb/ingest-*`,
`@bb/mcp`, future `@bb/metadata-optimizer`) and Binaries (`@bb/server`).
Never by `@bb/cli`.

## Responsibility

Single, minimal OpenRouter-backed LLM call surface for v0:

- `askLLM(prompt, opts?)` — POST to OpenRouter's chat-completions endpoint
  using `Config.OpenrouterApiKey` + `Config.OpenrouterModel`, return the
  model's text content
- AbortController-based timeout (default 90s, matches the kube-package
  reference `askLLM` shape)
- Typed errors via `@bb/errors`: `LlmConfigError` (missing key) and
  `LlmError` (HTTP non-2xx, timeout, empty completion)

## Public exports

```ts
function askLLM(prompt: string, opts?: AskLlmOptions): Promise<string>;

interface AskLlmOptions {
  model?: string; // overrides Config.OpenrouterModel
  timeoutMs?: number; // default 90_000
  systemPrompt?: string; // optional system role message
}
```

The package has no internal state, no caching, no module-scoped client.
Each call constructs its own `fetch` request.

## Data ownership

None. `askLLM` is a pure function over its arguments + workspace config.
No memoization, no module-scoped client, no in-memory request log. The
cost ledger described in [docs/arch.md:137](../../docs/arch.md#L137) is
**not** owned by v0 — it lands when telemetry / `bytebell cost` ships.

## Invariants

1. **OpenRouter only.** No direct Anthropic / OpenAI / Gemini calls. The
   user-facing model list is curated; the URL is fixed at
   `https://openrouter.ai/api/v1/chat/completions`.
2. **No env reads.** API key + model come from `getConfigValue(...)`. No
   `process.env`, no `.env`. Repo-wide ESLint rule blocks `process.env`.
3. **Single attempt.** No retry, no model escalation. Caller (today
   `@bb/ingest-github`) handles retries via BullMQ's `attempts: 3`.
4. **Errors are typed, not strings.** `LlmConfigError` carries the exact
   `bytebell keys set` hint; `LlmError` carries `cause`.
5. **Timeout is enforced.** AbortController fires at `timeoutMs`; the
   resulting `AbortError` is wrapped in `LlmError` with the timeout in
   the message.

## External dependencies

- Bun's built-in `fetch` (no SDK, no axios)
- `@bb/config`, `@bb/types`, `@bb/errors` — all `workspace:*`

## What is intentionally out of scope (v0)

- Cost ledger (`~/.bytebell/cost-ledger.sqlite`) — lands with telemetry
- Streaming responses
- Tool / function calling
- Model escalation (DEFAULT → SMARTER → SMARTEST)
- A `askJsonLLM<T>(prompt, schema)` JSON-mode wrapper — caller does
  `JSON.parse` with a try/catch fallback today
- Token-count tracking
- Per-call prompt logging
- Provider abstraction — OpenRouter is the only backend

## How to extend

Adding `askJsonLLM<T>(prompt, opts?): Promise<T>` when a second caller
needs strict JSON:

1. Implement in `src/json.ts` — calls `askLLM`, strips fences, parses
   with try/catch, throws `LlmError` on parse failure (caller currently
   does this inline).
2. Re-export from `src/index.ts`.
3. Update _Public exports_ here.

Adding a cost ledger when telemetry lands:

1. New file `src/ledger.ts` writing to
   `~/.bytebell/cost-ledger.sqlite` via `bun:sqlite`.
2. Wrap `askLLM` to capture `model`, prompt-token count, completion-token
   count, latency. Lookup pricing via a curated table.
3. Update _Out of scope_ → _Public exports_ here.
