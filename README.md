# Bytebell

Local, single-tenant knowledge engine for source code. Bytebell ingests Git repositories into a Neo4j graph where every file node carries LLM-generated semantic metadata, and serves that graph to MCP-capable LLM clients (Claude Code, Claude Desktop, Cursor, Continue, …) over a local HTTP endpoint. Everything runs on your machine — no cloud, no telemetry, no auth.

## What Bytebell does

You point `bytebell` at a repo. It clones the source, walks every file, and for each file calls an LLM (via OpenRouter) to extract a structured `FileAnalysis`: a one-paragraph **purpose**, a longer **summary** of what the file does and how it fits the architecture, a **business context** line tying it to the product domain, plus the file's classes, functions, keywords, internal imports, and external imports.

Those outputs are persisted into two stores:

- **Neo4j** receives a `:File` node enriched with `purpose`, `summary`, `businessContext`, `language`, `sha`, and `sizeBytes`, linked via `:HAS_CLASS`, `:HAS_FUNCTION`, `:HAS_KEYWORD`, `:HAS_IMPORT_INTERNAL`, and `:HAS_IMPORT_EXTERNAL` to deduplicated child nodes that are shared across the whole graph. Fulltext indexes cover purpose+summary, business context, keyword names, and class/function signatures.
- **MongoDB** receives the raw file content, language, SHA256, and the full `FileAnalysis` JSON for cite-back and exact retrieval.

LLM clients then query that graph through three MCP tools — `smart_search`, `keyword_lookup`, `retrieve_file` — which together cover fused semantic + structural search, reverse entity-to-file lookup, and targeted content reads. Together, they let an agent answer questions like _"Which files implement our retry/backoff policy and where is it configured?"_ without needing to read the entire repo into context.

## Who this is for

- **Solo engineers and small teams** who want a Claude / Cursor / Continue session to _actually_ know their codebase — not just whatever the tool can fit in a context window — without sending source to a third party.
- **OSS communities and academic research groups** who need a durable, reproducible code-knowledge index they can re-index from a single command.
- **Anyone running an MCP-capable agent on a private codebase** where compliance, IP, or just personal preference rules out hosted RAG-over-your-repo SaaS.

It is **not** a hosted product, not a chat UI, and not a multi-tenant platform. There is exactly one tenant — `orgId="local"` — and the server binds to `127.0.0.1`. If you want hosted, multi-tenant, or commercial-use rights, see the [Enterprise](#enterprise) section.

## Why this design — research grounding

Bytebell's shape — _build a code graph at ingest time, enrich every node with LLM-derived structured semantics, then serve retrieval against the joined structure-plus-semantics surface_ — is not a stylistic choice. It tracks a converging body of recent work showing that purely structural retrieval (AST / call-graph) and purely semantic retrieval (embeddings) each leave large performance on the table, and that combining them at indexing time (rather than at query time) is what unlocks the gains.

### Graphs beat flat retrieval for code

Repository-level graphs built from AST, imports, and call structure consistently outperform flat embedding retrieval on real engineering tasks; agent loops that traverse those graphs are now state-of-the-art on SWE-bench.

- **RepoGraph** ([2410.14684](https://arxiv.org/abs/2410.14684), ICLR 2025) — repo-level AST graphs plugged into agents for a 32.8% relative improvement on SWE-bench.
- **CodexGraph** ([2408.03910](https://arxiv.org/abs/2408.03910), NAACL 2025) — LLM agents query a code graph database; nodes enriched with semantic info beat similarity-only retrieval.
- **Code Graph Model (CGM)** ([2505.16901](https://arxiv.org/abs/2505.16901)) — LLM consumes both code graph structure and node semantic content; 43% on SWE-bench Lite.
- **Citation-Grounded Code Comprehension** ([2512.12117](https://arxiv.org/abs/2512.12117)) — argues that LLM-only and embedding-only approaches both fail because they are "structure-agnostic"; hybrid retrieval + structural reasoning wins.

### LLM-generated semantic enrichment closes the vocabulary gap

Identifiers and call edges alone don't capture intent — the same idea is named ten different ways across a codebase. LLM-derived natural-language summaries attached to each node mean retrieval can match what a developer _means_, not just what the code _spells_.

- **Tram** ([2305.11074](https://arxiv.org/abs/2305.11074), ACL 2023) — early work showing semantic enrichment of code summaries beats flat sentence-level retrieval.
- **LLM Agents Improve Semantic Code Search** ([2408.11058](https://arxiv.org/abs/2408.11058)) — RAG-powered LLM agents augment user prompts with repo context to fix the vocabulary-mismatch problem; LLM-injected metadata improves embedding-based retrieval.
- **Knowledge-Graph-Based Repository-Level Code Generation** ([2505.14394](https://arxiv.org/abs/2505.14394)) — hybrid approach: a knowledge graph captures structure while LLM-generated context fills the semantic gaps that pure retrieval misses.
- **Sense and Sensitivity** ([2505.13353](https://arxiv.org/abs/2505.13353)) — distinguishes lexical recall (verbatim code) from semantic recall (what the code does), showing these are different capabilities — supporting Bytebell's distinction between `summary` (semantic) and the kept-raw content in Mongo (lexical).

### Structured summaries and hierarchy beat blob summarization

Asking an LLM for a free-form blurb gives you a blurb. Asking for explicit fields — purpose, inputs, outputs, workflow, business context — and aggregating them bottom-up is what lets retrieval match at the right level of abstraction. Bytebell's `purpose` / `summary` / `businessContext` schema, plus its per-file deduplicated `:Class` / `:Function` / `:Keyword` nodes, map directly onto this approach.

- **Hierarchical Repository-Level Code Summarization for Business Applications** ([2501.07857](https://arxiv.org/abs/2501.07857), ICSE LLM4Code 2025) — most directly aligned with Bytebell. Uses LLMs to generate structured summaries with explicit Function Name / Inputs / Outputs / Purpose / Workflow fields per code unit, then aggregates bottom-up to file and package level. Grounds summaries in business/domain context, not just implementation.
- **Code Summarization Beyond Function Level** ([2502.16704](https://arxiv.org/abs/2502.16704)) — LLM-generated summaries enriched with class/repo context produce more comprehensive code summaries than function-only methods.
- **Code-Craft** ([2504.08975](https://arxiv.org/abs/2504.08975)) — closest published peer to Bytebell's method. Generates LLM-based structured summaries bottom-up from a code graph using the Language Server Protocol (language-agnostic, like Bytebell). 82% relative improvement in top-1 retrieval precision on large codebases (7,531 functions evaluated).
- **Repository-Level Code Understanding by LLMs via Hierarchical Summarization** (Springer 2025) — LLMs generate summaries at project / directory / file level at indexing time, enabling top-down search at query time. Pass@10 of 0.89 on real-world Jira issues — beats both flat retrieval and standard RAG.

### Hybrid structure + semantics, served as memory

The most recent work converges on serving the joined graph through a memory-style retrieval interface — exactly what MCP gives us. The agent doesn't reload the codebase every turn; it queries a durable, pre-enriched index.

- **Codebase-Memory** ([2603.27277](https://arxiv.org/abs/2603.27277)) — MCP-served knowledge graph with LLM-derived metadata; reports a 10× token reduction.

The design choices follow directly: each `:File` node carries LLM-generated `purpose` / `summary` / `businessContext` (semantics) alongside `:HAS_CLASS` / `:HAS_FUNCTION` / `:HAS_KEYWORD` / `:HAS_IMPORT_*` edges (structure), and the three MCP tools fuse both surfaces at query time.

## How it works

### Ingest

`bytebell index <url>` (or `bytebell ingest <path>` for a local tree) submits a job to an in-process BullMQ queue. The worker dispatches to an `IngestionStrategy` — today, `BasicFileAnalysisStrategy` ([packages/ingest-github/src/BasicFileAnalysisStrategy.ts](packages/ingest-github/src/BasicFileAnalysisStrategy.ts)). It clones the repo to `~/.bytebell/repos/<knowledgeId>/`, walks every file, runs a per-file OpenRouter call, and persists raw content to Mongo + the enriched node to Neo4j.

The per-file LLM call returns a single JSON object with this shape:

```jsonc
{
  "purpose": "Why this file exists. Max ~300 tokens.",
  "summary": "What it does, key patterns, architecture role. Max ~600 tokens.",
  "businessContext": "Product/domain impact. 2–3 lines, max ~100 tokens.",
  "classes": ["ExactName (~L3-29): What it represents", "..."],
  "functions": ["exact_name (~L42-58): Primary responsibility", "..."],
  "keywords": ["domain-term-1", "domain-term-2", "..."],
  "importsInternal": ["./relative/paths.ts", "..."],
  "importsExternal": ["express", "neo4j-driver", "..."],
}
```

`classes` and `functions` carry approximate line ranges so that the `retrieve_file` tool can later pull the right slice without re-reading the whole file. `keywords` are limited to ≤10 domain-relevant terms per file — they're how `keyword_lookup` resolves natural-language queries to entities.

**Re-indexing is diff-aware.** On every re-index, the strategy computes SHA256 of each file and compares against the prior `:File.sha`. Only files whose hash changed are re-analysed; everything else is skipped. LLM cost is therefore proportional to actual code churn, not to repo size.

### Graph shape

The schema is deliberately small. One `:Knowledge` node per indexed repo owns `:HAS_FILE` edges to its `:File` nodes. From every file, `:HAS_KEYWORD` / `:HAS_CLASS` / `:HAS_FUNCTION` / `:HAS_IMPORT_INTERNAL` / `:HAS_IMPORT_EXTERNAL` edges link to deduplicated `:Keyword`, `:Class`, `:Function`, and `:Module` nodes that are global across the whole graph — so the same library, the same exported function, the same domain term resolves to one node no matter how many repos reference it.

```cypher
(:Knowledge {knowledgeId, sourceKind, sourceUrl, branch, repoName, state})
  -[:HAS_FILE]->
(:File {knowledgeId, relativePath, language, sha, sizeBytes,
        purpose, summary, businessContext, updatedAt})
  -[:HAS_KEYWORD]->         (:Keyword {name})
  -[:HAS_CLASS]->            (:Class {signature})
  -[:HAS_FUNCTION]->         (:Function {signature})
  -[:HAS_IMPORT_INTERNAL]->  (:Module {name})
  -[:HAS_IMPORT_EXTERNAL]->  (:Module {name})
```

Constraints make `(knowledgeId, relativePath)` unique on `:File`, and `name` / `signature` unique on the global child node types. Fulltext indexes (`idx_file_purpose_summary_ft`, `idx_file_business_context_ft`, `idx_keyword_name_ft`, `idx_symbol_signature_ft`) back the natural-language search side; lookup-by-edge backs the structural side. Source: [packages/neo4j/src/files.ts](packages/neo4j/src/files.ts), [packages/neo4j/src/indexes.ts](packages/neo4j/src/indexes.ts).

There are no cross-file call edges in the current schema (`Function` nodes are deduplicated by signature, not threaded through call sites); that's a deliberate tradeoff for ingestion simplicity and language-agnostic ingest. The next-iteration `IngestionStrategy` will likely add them — strategies plug in behind the same interface, no fork of the worker required.

### Retrieval — three MCP tools

Registered at `http://127.0.0.1:8080/mcp`:

- **`smart_search(query, k=20)`** — the default entry point. Fused six-channel search across File `purpose`/`summary`, `businessContext`, paths, keyword names, class/function signatures, and module imports. Returns deduplicated, ranked top-K files with folder clustering. Use this first.
- **`keyword_lookup(term)`** — reverse lookup. A search term resolves to all matching named entities (keywords, classes, functions, module names) and the files linked to each. Use this when `smart_search` returns the right _concept_ but you want to see _every_ place it lives.
- **`retrieve_file(operation, …)`** — three operations:
  - `metadata` — purpose, summary, business context, classes (with line ranges), functions (with line ranges), keywords, imports, language, size, for up to 10 files at once.
  - `content` — read specific line ranges (use the ones from `metadata`), or search within a single file with surrounding context.
  - `bulk_search` — parallel scan of up to 50 files for a string. Returns `matched[]` and `noMatch[]` lists. Use to confirm a hypothesis ("does this constant appear in any of these candidate files?") without reading them all.

A bundled skill at `bytebell://skills/index` describes the recommended workflow for agents — `smart_search` first to find candidates, `keyword_lookup` to expand on a named entity, `retrieve_file metadata` to get line ranges, then `retrieve_file content` to read the right slice. Most well-formed code questions resolve in 2–4 tool calls.

**Worked example.** Question: _"Where do we configure HTTP retry behavior for outbound calls?"_ Tool sequence:

1. `smart_search("HTTP retry backoff outbound")` → returns 5 file candidates ranked by purpose+summary match, e.g. `packages/llm/src/openRouterClient.ts`, `packages/server/src/http/middleware/retry.ts`.
2. `retrieve_file(metadata, paths=[…])` → returns line ranges for the `RetryPolicy` class and the `withRetry` function in those files.
3. `retrieve_file(content, path=…, lines=42-78)` → returns the actual implementation, ready to cite back to the user.

No re-clone, no full-file dump into context, no embeddings round-trip.

## Architecture at a glance

A single Bun-built Express daemon, `bytebell-server`, hosts the ingestion HTTP routes, the MCP transport (Streamable HTTP + SSE), and the BullMQ workers all in-process. The CLI is a thin Ink/React TUI that only ever talks HTTP to that daemon — it never touches Mongo, Neo4j, or Redis directly. Workers run in the server's lifecycle; there is no separate worker fleet, no orchestrator, no Kubernetes assumptions. If the server is up, ingestion is up.

The ingestion path is _TUI / HTTP client → Express → in-process BullMQ worker → `IngestionStrategy` → Mongo + Neo4j_. The retrieval path is _MCP client → MCP tool → Neo4j + Mongo_.

Infrastructure is **BYO** — `bytebell boot` brings up a local Docker Compose stack (`bytebell-mongo`, `bytebell-neo4j`, `bytebell-redis`) with sane defaults and named volumes so data survives reboots, but you can point Bytebell at any reachable Mongo / Neo4j / Redis instances by editing `~/.bytebell/config.json`. The Neo4j password is freshly generated on first boot and stored at mode `0600`.

For the full PRD — package tiers, state machine, HTTP route catalogue, verification checklist, distribution strategy — see [docs/arch.md](docs/arch.md).

## Quickstart

> **Looking for the full CLI reference?** Every `bytebell` subcommand, flag, and option — with examples — lives in **[commands.md](commands.md)**. The Quickstart below covers only the minimum sequence to get from zero to a queryable graph. Reach for `commands.md` whenever you need details beyond the happy path.

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1 — runtime + workspace manager. Required on the host even if you install the CLI via npm in future, because `bytebell-server` uses `bun:sqlite`.
- [Docker](https://www.docker.com/) — for the local Mongo + Neo4j + Redis stack managed by `bytebell boot`. Skip if you're pointing at remote instances.
- An [OpenRouter](https://openrouter.ai) API key — every per-file analysis call goes through OpenRouter. Bytebell does **not** support direct Anthropic / OpenAI / Gemini / Bedrock keys (see [CLAUDE.md](CLAUDE.md) — Rule of LLM Provider).

### Install

```bash
git clone https://github.com/ByteBell/bytebell-public.git
cd bytebell-public
bun install
cd packages/cli && bun link && cd ../..
```

After `bun link`, the `bytebell` binary is on your `PATH`. Verify:

```bash
bytebell --help
```

### Configure (one-time)

**Always required** — your OpenRouter credentials. Every per-file analysis call goes through OpenRouter, so these two keys must be set before the server will boot:

```bash
bytebell set openrouter-api-key sk-or-…
bytebell set openrouter-model anthropic/claude-sonnet-4.6
```

**Infrastructure — pick one path.** The Mongo URI, Neo4j credentials, Redis URL, and server port can either be auto-provisioned by Bytebell against a local Docker stack, or pointed at instances you already run:

- **Path A — let Bytebell run Docker for you (default).** Skip this section entirely and go straight to `bytebell boot`. The boot command auto-fills any missing infra keys with local-Docker defaults, generates a fresh Neo4j password (stored at mode `0600` in `~/.bytebell/config.json`), and brings up the `bytebell-mongo` / `bytebell-neo4j` / `bytebell-redis` containers via Docker Compose. This is the right path if you don't already have Mongo / Neo4j / Redis running and you want one command to get going.
- **Path B — bring your own instances.** If you already run Mongo, Neo4j, and Redis (or want Bytebell to use a managed service), set the connection details yourself before booting:

  ```bash
  bytebell set mongo-uri      mongodb://user:pass@host:27017/bytebell
  bytebell set neo4j-uri      bolt://host:7687
  bytebell set neo4j-user     neo4j
  bytebell set neo4j-password <your-password>
  bytebell set redis-url      redis://host:6379
  ```

  When these keys are present, `bytebell boot` skips the Docker step and connects directly to your instances. Docker is not required on the host in this mode.

There is no `.env` file, anywhere — `~/.bytebell/config.json` is the single source of truth, and `bytebell set` is the only sanctioned way to write to it. See the [Configuration reference](#configuration-reference) for the full key list.

### Boot

```bash
bytebell boot
```

What happens, in order:

1. **Pre-flight check** — refuses to start if either OpenRouter key is blank.
2. **Auto-fill** — fills any missing infra config keys with local-Docker defaults; generates a Neo4j password if one isn't set.
3. **Stack up** — `docker compose up -d` brings up `bytebell-mongo`, `bytebell-neo4j`, `bytebell-redis` (named volumes — data persists across reboots).
4. **Health gate** — polls `docker compose ps` until all three services report `healthy`.
5. **Server up** — spawns `bytebell-server` (HTTP on `127.0.0.1:8080`, MCP at `/mcp`).

First boot pulls images, so it can take a couple of minutes. Subsequent boots are fast.

### Index a repository

Public repo:

```bash
bytebell index https://github.com/anthropics/claude-code
```

Private repo (use `--token`, never paste a PAT into a positional arg):

```bash
bytebell index https://github.com/your-org/your-repo --token <github-pat>
```

Watch progress:

```bash
bytebell ls
# ID         SOURCE                  STATE       UPDATED           FILES
# 87067fbe…  github:org/your-repo    PROCESSING  2026-05-09 14:11  214
```

States flow `CREATED → QUEUED → INGESTED → PROCESSING → PROCESSED` (or `FAILED`). When the row reads `PROCESSED`, the graph is fully populated and the MCP tools will return results for that repo.

You can also ingest a local directory directly:

```bash
bytebell ingest /path/to/source-tree
```

### Inspect token & cost stats

```bash
bytebell stats
```

Shows totals (input tokens, output tokens, estimated USD cost), a per-repo breakdown, and per-commit rows including processing time and files analysed. Cost is computed against live OpenRouter pricing; entries whose model has no published pricing show as `unknown`.

### Delete an indexed entry

```bash
bytebell delete
```

Lists every indexed knowledge entry as an arrow-keyable picker. Selecting one and confirming `y` cancels any pending BullMQ jobs for that knowledge, removes the Knowledge subgraph from Neo4j (`DETACH DELETE`), and removes the Mongo `knowledge`, `raw`, and `processing_stats` rows tagged with that id. Press `Esc` (or `n` at the confirm step) to cancel.

### Connect an MCP client

The MCP endpoint is at `http://127.0.0.1:8080/mcp` (Streamable HTTP). For Claude Code:

```bash
claude mcp add --transport http bytebell http://127.0.0.1:8080/mcp
```

For Claude Desktop / Cursor / Continue, drop this into your MCP config:

```json
{
  "mcpServers": {
    "bytebell": {
      "type": "http",
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

The server registers `smart_search`, `keyword_lookup`, and `retrieve_file`, plus the bundled skill at `bytebell://skills/index` that the client can fetch and install once per session for the recommended workflow.

### Stop & re-boot

```bash
bytebell shutdown   # stops the server only — Docker keeps running
bytebell boot       # warm restart, fast
```

To stop the containers too:

```bash
docker compose -f infra/docker/docker-compose.yml down
```

Add `-v` to also drop the named volumes (destroys all indexed data).

Full CLI reference, including every flag and subcommand: [commands.md](commands.md).

## Configuration reference

Settings live in `~/.bytebell/config.json` and are written exclusively by `bytebell set <key> <value>` (or by the first-run auto-fill on `bytebell boot`). Keys:

| Key                  | Purpose                                  | Default                              |
| -------------------- | ---------------------------------------- | ------------------------------------ |
| `openrouter-api-key` | API key for per-file LLM analysis        | _(required, blank by default)_       |
| `openrouter-model`   | OpenRouter model slug used for analysis  | _(required)_                         |
| `mongo-uri`          | MongoDB connection string                | `mongodb://localhost:27017/bytebell` |
| `neo4j-uri`          | Neo4j Bolt URI                           | `bolt://localhost:7687`              |
| `neo4j-user`         | Neo4j auth user                          | `neo4j`                              |
| `neo4j-password`     | Neo4j auth password                      | _(generated on first boot)_          |
| `redis-url`          | Redis URL for BullMQ                     | `redis://localhost:6379`             |
| `server-port`        | Local HTTP/MCP port                      | `8080`                               |
| `concurrency-github` | Concurrent files analysed per GitHub job | tuned per box                        |
| `log-level`          | Winston log level                        | `info`                               |
| `log-retention-days` | Daily log retention                      | `14`                                 |

If a piece of infra is missing, the server prints the exact `bytebell set …` command you need and refuses to boot — it never silently reads `process.env`.

## Where things live

- `~/.bytebell/config.json` — runtime config (URIs, OpenRouter key, log level, …), mode `0600`
- `~/.bytebell/repos/<knowledgeId>/…` — cloned source trees for every indexed repo
- `~/.bytebell/logs/server-YYYY-MM-DD.log` — daily server log
- `~/.bytebell/logs/cli-YYYY-MM-DD.log` — daily CLI log
- `~/.bytebell/pid` — running server PID (unlinked on graceful shutdown)
- `~/.bytebell/install_id` — local-only UUID, never transmitted
- `infra/docker/.env` — generated; contains the Neo4j password (gitignored)

## Project layout

The workspace is organised as 13 `@bb/*` packages in tier order — kernel (`@bb/types`, `@bb/errors`) → infrastructure (`@bb/config`, `@bb/logger`, `@bb/mongo`, `@bb/neo4j`, `@bb/redis`) → cross-cutting (`@bb/llm`) → strategy (`@bb/queue`) → domain (`@bb/mcp`, `@bb/ingest-github`) → binaries (`@bb/server`, `@bb/cli`). Imports flow downward only; the two binaries communicate over HTTP and never import each other (enforced by an ESLint boundary rule). Each package has a `context.md` describing its contract, public exports, and tier — those are the authoritative reference when modifying a package. See [docs/arch.md](docs/arch.md) for the full tier map.

## Enterprise

Bytebell-public is the OSS edition. ByteBell also offers a separately-licensed **Enterprise** edition for organizations that need a commercial-use grant, hardening, and direct support. Enterprise typically includes:

- A commercial-use grant covering use by or on behalf of for-profit entities, including SaaS deployments and revenue-generating applications.
- Hardened multi-tenant deployment patterns, SSO / SCIM, audit logging, and data-isolation guarantees.
- Additional ingestion strategies (cross-file call graphs, dependency-graph extraction, PDF and design-doc ingestion) and additional MCP tools.
- Access to the managed ByteBell knowledge surface and connectors to internal sources (Confluence, Jira, Notion, GitHub Enterprise, …).
- Engineering support and SLAs for production deployments.

To discuss Enterprise licensing, evaluation, or services, contact `saurav@bytebell.ai`.

## Contributing

Hooks, commit conventions, and pre-push gates are documented in [contributing.md](contributing.md). Architectural rules — file-size limits, tier boundaries, the `context.md` requirement, the Bun-only and OpenRouter-only constraints — live in [CLAUDE.md](CLAUDE.md) and apply to every PR. New ingestion shapes (AST extraction, cross-file call graphs, language-server-driven analysis) land as new `IngestionStrategy` implementations, never as forks of the worker.

## License

Bytebell is released under **AGPL-3.0 with an additional non-commercial use clause** — see [LICENSE](LICENSE) for the authoritative text. Personal, academic, research, and non-profit use are unrestricted under AGPL-3.0 (network-copyleft applies — see the LICENSE file for what that means in practice). **Commercial use** is governed by license terms and is covered by the [Enterprise edition](#enterprise) (`saurav@bytebell.ai`). The running server itself does **not** verify a license; governance is by license terms, not by code. The server is meant for local single-tenant use — no remote network surface; everything binds to `127.0.0.1`.
