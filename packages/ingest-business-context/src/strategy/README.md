# `strategy/` — context

Orchestrates the per-job pipeline.

| File                  | Responsibility                                                                 |
| --------------------- | ------------------------------------------------------------------------------ |
| `commit-validator.ts` | `assertCommitIndexed()` — throws `CommitNotIndexedError` if files don't exist. |
| `execute.ts`          | The disk pipeline: validate → enrich → title → analyse → persist.              |
| `store-graph.ts`      | The Neo4j pipeline: indexes → node → version → file-version edges → keywords.  |

`execute` and `store-graph` are separate by design — the worker calls them in
sequence, but a synchronous HTTP path can call them in the same request, and
a future scheduler can defer `store-graph` for later.
