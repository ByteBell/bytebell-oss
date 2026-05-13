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
  `GithubPullPayload`, `PayloadFor<T>` — the queue/job vocabulary shared
  between `@bb/queue` (publisher) and future `@bb/ingest-*` packages
  (worker handlers).
- `KnowledgeState` — the processing-status lifecycle enum (`CREATED →
QUEUED → INGESTED → PROCESSING → PROCESSED ↘ FAILED`) referenced by
  `@bb/queue` (writes `QUEUED`), `@bb/mongo` (`setKnowledgeState`), and
  future ingest workers.

Future inhabitants (added on need basis): full `Knowledge`, `Raw`,
`Node`, `MCP*` document shapes — the cross-package domain types named in
[docs/arch.md:69](../../docs/arch.md#L69).

## Public exports

```ts
enum Config { ... }

enum JobType     { GithubIndex, GithubPull }
enum JobPriority { Low, Normal, High }
interface GithubIndexPayload { knowledgeId, repoUrl, branch?, commitHash?, gitToken? }
interface GithubPullPayload  { knowledgeId, targetCommitHash?, gitToken? }
interface JobMessage<P>      { id, type, priority, knowledgeId, attempt, createdAt, payload }
type      PayloadFor<T extends JobType>

enum KnowledgeState { Created, Queued, Ingested, Processing, Processed, Failed }
```

Add new shared types here only when **two or more** packages need to refer
to the same shape.

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
