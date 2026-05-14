# `@bb/types` — context

## Tier

Kernel. Sits at the bottom of the import graph; depended on by every higher
tier (Infrastructure, Strategy, Domain, Binaries). Has no workspace
dependencies and no runtime dependencies — pure type / enum surface.

## Responsibility

Single home for shared types and enums that cross package boundaries:

- `Config` — the enumeration of every key under `~/.bytebell/config.json`.
  Lives here (not in `@bb/config`) because consumers in higher tiers — e.g.
  `@bb/logger`, `@bb/mongo` — refer to it without wanting an implementation
  dependency on `@bb/config`'s schema/loader/writer.
- `JobType`, `JobPriority`, `JobMessage<P>`, `GithubIndexPayload`,
  `GithubPullPayload`, `LocalIngestPayload`, `PayloadFor<T>`,
  `PayloadLlmOverrides` — the queue/job vocabulary shared between
  `@bb/queue` (publisher) and `@bb/ingest-*` packages (worker handlers).
  `PayloadLlmOverrides` is the optional `{ llmApiKey?, llmProvider?,
llmModel?, llmKeyId? }` mixin that lets downstream consumers carry per-job
  LLM credentials through the payload (the extension point used by the
  enterprise wrapper to inject per-org credentials at the enqueue
  boundary). `llmProvider` is intentionally typed as `string` rather than
  a closed union — OSS standalone uses `"openrouter"`/`"ollama"`, but
  downstream consumers may carry richer taxonomies (`"anthropic"`,
  `"gemini"`, …) that OSS ignores at runtime. `llmKeyId` is opaque to OSS;
  it's an audit pointer kept by downstream consumers. Mixed into both
  GitHub payloads.
- `KnowledgeState` — the processing-status lifecycle enum (`CREATED →
QUEUED → INGESTED → PROCESSING → PROCESSED ↘ FAILED`) referenced by
  `@bb/queue` (writes `QUEUED`), `@bb/mongo` (`setKnowledgeState`), and
  future ingest workers.
- `KnowledgeDoc`, `KnowledgeSource`, `GithubKnowledgeSource`,
  `LocalKnowledgeSource`, `KnowledgeInfo` — the cross-package shape of the
  Mongo `knowledge` document. Split into two substructures with
  non-overlapping responsibilities: `KnowledgeSource` discriminates the
  upstream type (github vs local) and carries per-kind ingestion state —
  for github, the current head commit and the full commit history; for
  local, the on-disk path. `KnowledgeInfo` carries the repo coordinates the
  pipeline reads on every run (URL and branch); it has an open shape so
  downstream consumers can attach extra fields without forcing schema
  changes here. The pull pipeline reads URL and branch off `KnowledgeInfo`
  directly — there is no fallback chain to `KnowledgeSource`.

Future inhabitants (added on need basis): full `Raw`, `Node`, `MCP*`
document shapes — the cross-package domain types named in
[docs/arch.md:69](../../docs/arch.md#L69).

## Data ownership

None. This package owns no runtime state — only types and enum members.

## Invariants

1. **No runtime dependencies.** `dependencies` block stays empty.
2. **No I/O, no logic.** Pure declarations. If logic creeps in, it belongs
   in a higher tier package.
3. **Stable surface.** Renaming an exported member is a breaking change for
   the entire workspace; treat additions as additive and removals as
   coordinated migrations.

## External dependencies

None.

## What is intentionally out of scope

- Runtime helpers (validators, parsers, narrowing functions) — those belong
  in the package that owns the data.
- Default values, hint strings, schema parsing — those stay in `@bb/config`.

## How to extend

To promote a type from a single-package internal to a shared kernel type:

1. Confirm at least two packages need to import it.
2. Move the declaration into `src/<name>.ts`.
3. Re-export from `src/index.ts`.
4. Add `@bb/types` to the importing package's `package.json` dependencies.
5. Update the source-of-record package to import from `@bb/types` rather
   than re-defining locally.
