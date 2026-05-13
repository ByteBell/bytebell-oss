# `@bb/types/src` — context

Implementation of `@bb/types`. See [../context.md](../context.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — public re-exports. The only entry point other
  packages may import. Anything not re-exported here is internal.
- **[config.ts](config.ts)** — the `Config` enum: every key under
  `~/.bytebell/config.json`. The string values match the on-disk JSON keys
  (`server_port`, `mongo_uri`, …). Lives here — not in `@bb/config` — so that
  consumers like `@bb/logger` and `@bb/mongo` can refer to a config key
  without taking a dependency on `@bb/config`'s schema/loader/writer
  implementation.
- **[job.ts](job.ts)** — the queue vocabulary: `JobType` (today: GitHub
  index + pull, local ingest), `JobPriority`, the per-type payload
  interfaces (`GithubIndexPayload`, `GithubPullPayload`,
  `LocalIngestPayload`), the `PayloadLlmOverrides` mixin, the
  `JobMessage<P>` envelope wrapping payloads as BullMQ `job.data`, and
  the `PayloadFor<T>` type-level dispatcher. Shared between `@bb/queue`
  (publisher) and `@bb/ingest-*` packages (worker handlers). Ingest
  payloads carry an optional `orgId?: string` override; OSS callers omit
  it and the pipeline reads `Config.OrgId` from `~/.bytebell/config.json`
  (locked to `"local"` in OSS builds; downstream enterprise builds set
  `orgId` per-job). Both GitHub payloads also extend `PayloadLlmOverrides`
  which adds optional `llmApiKey?`, `llmProvider?: string`, `llmModel?`,
  `llmKeyId?` — the extension point that lets downstream enterprise
  builds resolve per-org LLM credentials at the enqueue boundary and
  pass them through the payload. `llmProvider` is `string` (not a closed
  union) so multi-provider enterprise consumers can carry `"anthropic"`,
  `"gemini"`, etc.; OSS narrows to `"openrouter"`/`"ollama"` at the LLM
  client boundary. `llmKeyId` is opaque audit metadata OSS ignores. OSS
  standalone leaves all four fields unset and the pipeline falls back to
  `Config.OpenrouterApiKey` + `Config.LlmProvider`. `GithubPullPayload`
  also carries an optional `orgId?` so downstream multi-tenant workers
  can scope Mongo/Neo4j lookups by org.
- **[knowledge.ts](knowledge.ts)** — the `KnowledgeState` enum modeling
  the lifecycle in [CLAUDE.md](../../../CLAUDE.md). v0 only ships the
  enum; the full `Knowledge` document interface lands when domain CRUD
  helpers in `@bb/mongo` need it.

## Module dependency graph

```
config.ts    → (leaf — no imports)
job.ts       → (leaf — no imports)
knowledge.ts → (leaf — no imports)
index.ts     → re-exports all three
```

Pure declarations, no cycles possible.

## Invariants enforced here

- **No imports.** Source files import nothing — not from this package, not
  from siblings, not from Node built-ins. If an entry needs to import, it
  belongs in a higher tier.
- **Enum string values are the on-disk JSON keys.** `Config.MongoUri =
"mongo_uri"` is the contract `@bb/config`'s Zod schema relies on; renaming
  a value is a breaking change for both the file format and every consumer.
- **One file per logical group.** `config.ts` holds config keys, `job.ts`
  holds queue vocabulary, `knowledge.ts` holds knowledge-document
  vocabulary. Future domain shapes (`Raw`, `Node`, `MCP*`) get their own
  files when promoted from internal to shared. Don't pile unrelated types
  into a single file.

## Adding a shared type

Follow the recipe in [../context.md](../context.md) under _How to extend_.
A type is promoted to this folder only when **two or more** packages need
to refer to the same shape; single-package types stay where they are used.
