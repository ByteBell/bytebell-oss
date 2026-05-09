# How Bytebell compares

Bytebell sits at the intersection of code-specific knowledge graphs and MCP-native local retrieval — adjacent tools tend to optimize one axis at the cost of another. The closest neighbours, and what each one is built for:

- **[PageIndex][pageindex]** — vectorless, reasoning-based RAG over long professional documents (PDFs, filings).
- **[GitNexus][gitnexus]** — zero-server, MCP-native code knowledge graph built from Tree-sitter ASTs; runs in the browser or as a local CLI.
- **[Microsoft GraphRAG][graphrag]** — general-purpose entity-and-community RAG over narrative text, shipped as a Python library.
- **[Sourcegraph + Cody][sourcegraph]** — enterprise-scale code search and IDE-integrated AI coding assistant; self-hosted or SaaS, multi-tenant.
- **[Augment Code][augment]** — proprietary SaaS context engine + IDE agents tuned for very large multi-repo codebases.

The rest of this doc is one feature table across all six tools, then a short pros / cons sketch of each competitor framed against Bytebell.

> One-liner: Bytebell is the only one of the six that is simultaneously code-specific, MCP-native by design, fully local with zero outbound calls except OpenRouter, graph-based with LLM-generated per-file semantics, and BYO-infra single-tenant — every other tool drops at least one of those.

## Feature comparison

| Axis                           | Bytebell                                                               | PageIndex                        | GitNexus                              | GraphRAG                                               | Sourcegraph + Cody               | Augment Code                    |
| ------------------------------ | ---------------------------------------------------------------------- | -------------------------------- | ------------------------------------- | ------------------------------------------------------ | -------------------------------- | ------------------------------- |
| Primary domain                 | Code repos                                                             | Long professional documents      | Code repos                            | General text / narrative                               | Code repos                       | Code repos                      |
| Deployment model               | Local Bun daemon (BYO infra)                                           | Python lib + cloud agent         | Browser (WASM) or local CLI           | Python library                                         | Self-hosted / SaaS multi-tenant  | SaaS context engine             |
| Indexing technique             | Per-file LLM: narrative + entity / relationship extraction             | Tree-of-contents reasoning index | Tree-sitter AST + community detection | Per-chunk LLM entity extraction + community clustering | Search index + LSIF / SCIP       | Proprietary semantic index      |
| Storage                        | Neo4j + MongoDB                                                        | TOC tree (no vector DB)          | LadybugDB (embedded, ex-Kuzu)         | Parquet / GraphML files                                | Proprietary code-graph index     | Proprietary cloud index         |
| Retrieval surface              | MCP-native (3 tools) + HTTP                                            | Python SDK / cloud API           | MCP + browser UI                      | Python `query` API                                     | IDE plugins, web UI, REST        | IDE plugins + recent MCP server |
| LLM-derived per-node semantics | `purpose` + `summary` + `businessContext` per file                     | None (structural TOC)            | Optional per-symbol                   | Community summaries (text clusters)                    | None (search-index based)        | Yes, proprietary embeddings     |
| Diff-aware re-indexing         | Per-file content SHA-256 (commit SHA for early-bail; LLM cost ∝ churn) | Full re-parse                    | Git-diff impact + auto re-index hook  | Full re-extract                                        | Incremental indexing             | Continuous (managed)            |
| Outbound network calls         | OpenRouter only; binds 127.0.0.1                                       | Cloud agent option               | None (zero-server)                    | None (offline lib) + LLM provider                      | Code snippets ≤28 KB → cloud LLM | Source code → SaaS              |
| Multi-tenant / auth            | None — `orgId="local"`, no auth                                        | None (lib)                       | None (single-user)                    | None (lib)                                             | SSO / SCIM / RBAC                | Org accounts                    |

## Sources

[pageindex]: https://github.com/VectifyAI/PageIndex
[gitnexus]: https://github.com/abhigyanpatwari/GitNexus
[graphrag]: https://github.com/microsoft/graphrag
[sourcegraph]: https://sourcegraph.com/docs/cody
[augment]: https://www.augmentcode.com/context-engine

- PageIndex — <https://github.com/VectifyAI/PageIndex>
- GitNexus — <https://github.com/abhigyanpatwari/GitNexus>
- Microsoft GraphRAG — <https://github.com/microsoft/graphrag>
- Sourcegraph Cody — <https://sourcegraph.com/docs/cody>
- Augment Code Context Engine — <https://www.augmentcode.com/context-engine>
