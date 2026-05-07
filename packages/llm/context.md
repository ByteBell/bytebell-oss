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
  using `Config.OpenrouterApiKey` + `Config.OpenrouterModel` as the
  primary model, plus `Config.OpenrouterFallbackModel1..4` as the
  fallback chain. The request body includes a `models: [...]` array
  when the deduplicated chain has ≥2 non-empty entries; OpenRouter
  routes among them and bills only the responder. Returns
  `{ content, usage: { model, inputTokens, outputTokens } }` where
  `model` is the actual model the gateway routed to. Tokens come straight
  from OpenRouter's `usage.prompt_tokens` / `usage.completion_tokens`.
- `estimateCostUsd(model, inputTokens, outputTokens)` and
  `estimateCostFromBreakdown(modelTokens)` — async cost helpers backed
  by a one-shot fetch of OpenRouter's `/api/v1/models` (cached in module
  scope for the process lifetime). Returns `-1` when the model has no
  published pricing.
- AbortController-based timeout (default 90s, matches the kube-package
  reference `askLLM` shape)
- Typed errors via `@bb/errors`: `LlmConfigError` (missing key) and
  `LlmError` (HTTP non-2xx, timeout, empty completion)
- `tokenLen(text)`, `encodeTokens(text)`, `decodeTokens(tokens)` —
  thin wrappers over `tiktoken` (`cl100k_base` encoding). Lazy-cached
  encoder at module scope; char/4 fallback only fires on tokenizer
  init failure. Used by `@bb/ingest-github` for chunk sizing,
  routing, and condense-prompt budgeting.

## Public exports

```ts
function askLLM(prompt: string, opts?: AskLlmOptions): Promise<AskLlmResult>;
function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): Promise<number>;
function estimateCostFromBreakdown(modelTokens: ModelTokenBreakdown): Promise<number>;
function tokenLen(text: string): number;
function encodeTokens(text: string): number[];
function decodeTokens(tokens: number[]): string;

interface AskLlmOptions {
  model?: string; // overrides Config.OpenrouterModel
  fallbackModels?: string[]; // overrides Config.OpenrouterFallbackModel1..4
  timeoutMs?: number; // default 90_000
  systemPrompt?: string; // optional system role message
}
interface AskLlmResult {
  content: string;
  usage: { model: string; inputTokens: number; outputTokens: number };
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
3. **OpenRouter-native fallback chain.** The request body sends
   `models: [primary, ...fallbacks]` whenever the deduplicated chain has
   ≥2 entries. Primary is `Config.OpenrouterModel`; fallbacks come from
   four discrete slots `Config.OpenrouterFallbackModel1` through
   `…Model4` (each a `string`; empty string means "skip this slot"). All
   four slots ship with curated defaults so a fresh install gets fallback
   without any user action. OpenRouter tries the chain in order and bills
   only the responder; `usage.model` reflects which one. Caller still
   sees a single `AskLlmResult`. BullMQ's `attempts: 3` wraps the whole
   call — retries walk the chain again, useful when a transient
   OpenRouter outage clears between retries.
4. **Errors are typed, not strings.** `LlmConfigError` carries the exact
   `bytebell keys set` hint; `LlmError` carries `cause`.
5. **Timeout is enforced.** AbortController fires at `timeoutMs`; the
   resulting `AbortError` is wrapped in `LlmError` with the timeout in
   the message.
6. **Tokenizer is module-cached.** `tiktoken`'s `cl100k_base` encoder
   is lazy-initialized on first `tokenLen` call and reused for the
   process lifetime. Chosen because every modern OpenRouter chat model
   tokenizes within ~10% of `cl100k_base` for code-shaped input. Char/4
   fallback only fires on tokenizer init failure.

## External dependencies

- Bun's built-in `fetch` (no SDK, no axios)
- `tiktoken` — WASM-backed BPE tokenizer (matches kube-package's
  current `askLLM.ts`). Bun handles WASM modules natively.
- `@bb/config`, `@bb/types`, `@bb/errors` — all `workspace:*`

## What is intentionally out of scope (v0)

- Cost ledger (`~/.bytebell/cost-ledger.sqlite`) — lands with telemetry
- Streaming responses
- Tool / function calling
- A `askJsonLLM<T>(prompt, schema)` JSON-mode wrapper — caller does
  `JSON.parse` with a try/catch fallback today
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
