# Bytebell [bytebell.ai]

## What is this and why does it exist

If you've ever worked on a codebase that spans multiple repositories, you already know the pain. You open up your copilot or your coding agent, you ask it something like "how does this authentication service in Repo A affect the user management flow in Repo B" and it just goes blank.

It either hallucinates an answer or tells you it doesn't have enough context. And the thing is, its not the model's fault. The model is smart enough. The problem is that no tool in the current ecosystem gives it the right context to work with.

Every code intelligence tool today, whether its vector search based like **claude-context** and **Cody**, or AST based like **Serena** and **code-graph-mcp**, or even production grade tools like **Sourcegraph** with **SCIP** indexing, they all do fundamentally the same thing.

They read your code structurally. They parse syntax trees, they map function calls, they build embedding vectors. And all of that is useful to some degree but it completely misses the question that actually matters which is what is this code for. Not what it looks like syntactically, not what functions it calls, but what is its purpose, what business logic does it encode, why does it exist in the first place, and how does it connect to code in entirely different repositories that were written by entirely different teams.

**ByteBell** takes a fundamentally different approach. Instead of parsing structure and hoping the model figures out meaning at query time, we run an LLM once at index time across your entire codebase. The LLM reads every file and extracts its **semantic purpose**, its **business role**, its **cross-repo dependencies**, what it does and why it does it. All of that understanding gets stored in a **persistent semantic graph** that lives across sessions, across models, across every copilot and agent you use. You pay the LLM cost once during indexing and then every tool in your stack benefits from that understanding forever.

The key insight here is that every other tool in this space persists an index. ByteBell persists meaning. This is an architectural difference that changes everything downstream.

## How it actually works

When you point ByteBell at your repositories, it does a one time semantic indexing pass. For every file, it sends the code to an LLM with a carefully designed prompt that asks it to extract several things: what does this file do in plain english, what business domain does it belong to, how does it relate to other files in this repo and in other repos, what would break if you changed it, and what is the intent behind the key functions and classes.
All of these semantic annotations get stored in a graph database where the nodes are files, functions, and concepts, and the edges are semantic relationships like "this service depends on that authentication module for JWT validation" rather than just "this file imports that file." The difference is massive because when a model later queries this graph it gets back actual understanding, not just a list of files that look syntactically similar to the query.
The graph is persistent and shared. It doesn't disappear when your session ends. It doesn't get rebuilt every time you switch from one copilot to another. Whether you're using Claude, or GPT, or an open source model, or switching between Cursor and Windsurf and Claude Code, they all read from the same semantic graph. Your codebase understanding is decoupled from any single tool or model.

## The cost problem and how we solved it

The obvious objection to using LLMs for indexing is cost. If you're running Claude Opus on every file in a large codebase you'll burn through thousands of dollars before you even start working. So we did something that nobody else has done properly, we ran a systematic benchmark across 14 different models to find the sweet spot between accuracy and cost.
We tested on 30 Kubernetes ecosystem files with roughly 33,800 average input tokens per file and 3,200 output tokens per file. We scored each model across 7 categories including search accuracy, graph quality, semantic understanding, cross-repo integration, section mapping, business context extraction, and JSON formatting. Any model that scored below 70 points was dropped as unusable regardless of how cheap it was.
The results were surprising.
DeepSeek V4 Flash can index 1,000 files at just $7.01 with an accuracy score of 71.13. Thats 100x cheaper than Claude Opus 4.7 at $752.70 and only about 2.3 points behind it in quality. GLM 5.1 sits in a nice balanced spot at $23.24 with 72.22 accuracy. Claude Sonnet 4.6 is the premium quality option at $149.40 with the highest accuracy at 73.56 if you need the absolute best analysis and dont mind paying for it.

Models like GPT 5.4 scored 55.65 which is just completely unusable, and Step 3.5 Flash came in at 69.71 which is cheap but falls below our quality floor.

So the default recommendation is DeepSeek V4 Flash for most use cases because it gives you production quality semantic indexing at a cost thats genuinely negligible even for very large codebases. You can always run a premium model like Sonnet on your most critical repositories if you want that extra 2 points of accuracy.

## What we tested and what we found

We ran ByteBell on the SWE-bench Verified benchmark, specifically on Astropy and OpenTelemetry which are the two most important repositories in that dataset, roughly 8 GB of code combined. We compared task performance with ByteBell's semantic context layer (MCP) versus raw model performance without it.

The per-task results across 55 tasks show something that seems counterintuitive at first. ByteBell feeds the model 22 less context, the average cost per task is actually lower with ByteBell at $0.52 versus $0.73 without it.
The reason is simple, when the model has real semantic understanding of the codebase it stops wasting tokens exploring dead ends, searching through irrelevant files, and guessing at relationships. It knows exactly where to look and what things mean. The result is 60% less cost and 80% faster responses with the same or better accuracy.

But the really important finding was about cross-repository performance. We tested on 150,000+ files across 46 Kubernetes ecosystem repositories and in cross-repo scenarios, even SOTA models with their full prompt caching and claude.md configurations dont just perform poorly, they fail to complete the task entirely. They literally cannot finish. The model runs out of context, gets confused about which repo it's looking at, hallucinates connections that dont exist, and eventually gives up or produces garbage. ByteBell's persistent semantic graph is the only approach we've seen that gives the model enough cross-repo understanding to actually solve these problems end to end.

## How ByteBell compares to existing tools

We did a detailed comparison against the major tools in this space and the differences are architectural, not incremental.
Vector search tools like claude-context and Cody embed your code into vector space and retrieve chunks that are semantically similar to your query. This works okay for simple "find code that looks like this" queries but it fundamentally treats code like english text which it is not.

Code is logic with complex dependency chains, side effects, and implicit contracts that dont show up in embedding similarity. These tools also dont persist understanding across sessions and dont share context across different copilots.

AST and LSP based tools like **Serena** and **code-graph-mcp** parse your code into abstract syntax trees and use language server protocols to map structural relationships. They know what calls what and what imports what but they have zero understanding of business intent. They can tell you that function A calls function B but they cannot tell you why that call exists or what business rule it implements. They also work within a single repository boundary and have no concept of cross-repo semantic connections.

**GitNexus** builds a static AST graph which is essentially a more sophisticated version of the AST approach. It maps out structural relationships across your codebase in a graph format which is useful but again, its purely structural. It knows syntax, not semantics. And it doesn't persist any understanding across sessions.

**Graphify** combines AST parsing with multimodal analysis so it tries to understand code through multiple representations beyond just the syntax tree. Its a step in the right direction but its still fundamentally building a structural graph enriched with pattern matching rather than extracting actual semantic intent. No cross-repo graph, no persistent meaning across sessions.

**Sourcegraph** with **SCIP** indexing is probably the most production grade tool in this list and it does excellent structural code intelligence at scale. But SCIP is a structural indexing format, it gives you precise code navigation and cross-references but not semantic understanding. It also only partially supports cross-repo connections and doesn't share context across different copilots and agents.
Augment is a cloud SaaS approach that does provide some cost reduction per query but it doesn't persist meaning across sessions, doesn't share across copilots, doesn't build a cross-repo semantic graph, and critically it cannot run on-prem or air-gapped which is a dealbreaker for many enterprises.

**ByteBell** is the only tool that checks every box. Persistent semantic understanding across sessions, shared across every copilot and agent, one graph that works with every model, cross-repo semantic connections, business context per commit, fully on-prem and air-gapped capable, 80%+ cost reduction per query, and 20 to 40% accuracy improvement on cross-repo tasks.

Based on what we've seen so far, we believe that open source models with access to ByteBell's semantic context layer can improve their performance by at least 10%-40% compared to current SOTA models running without it. The early results already point strongly in that direction but we need to prove it across the full dataset to make that claim definitively.

If you can sponsor API credits on OpenRouter, OpenAI, or Anthropic, or if you know someone who can, please reach out. Every dollar goes directly into running benchmarks on the complete SWE-bench Verified dataset and we will publish all results openly. This is an open source project and the benchmark results will be open too.

## Quickstart

> Looking for the full CLI reference? Every `bytebell` subcommand, flag, and option lives in **[commands.md](commands.md)**. The Quickstart below is the minimum sequence from zero to a queryable graph.

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1 — runtime + workspace manager.
- [Docker](https://www.docker.com/) — for the local Mongo + Neo4j + Redis stack `bytebell boot` brings up.
- An [OpenRouter](https://openrouter.ai) API key — every per-file analysis call goes through OpenRouter.

### Install

See [commands.md](commands.md) for install steps. Once installed, verify with `bytebell --help`.

### Configure

Two values to set yourself — everything else is auto-provisioned on first boot:

```bash
bytebell set openrouter-api-key sk-or-…
bytebell set openrouter-model anthropic/claude-sonnet-4.6
```

There is no `.env` file anywhere. `~/.bytebell/config.json` (mode `0600`) is the single source of truth, and `bytebell set` is the only sanctioned way to write to it. If you already run Mongo / Neo4j / Redis and don't want the Docker stack, see [Bring your own infrastructure](#bring-your-own-infrastructure) below.

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

First boot pulls images and can take a couple of minutes. Subsequent boots are fast.

### Index a repo

```bash
bytebell index https://github.com/anthropics/claude-code
# private repo: add --token <github-pat>; never paste the PAT positionally
bytebell ls   # watch state: CREATED → QUEUED → INGESTED → PROCESSING → PROCESSED
```

When the row reads `PROCESSED`, the graph is fully populated and the MCP tools will return results for that repo. Local directories work too: `bytebell ingest /path/to/source-tree`.

### Connect an MCP client

| Client         | Setup                                                                |
| -------------- | -------------------------------------------------------------------- |
| Claude Code    | `claude mcp add --transport http bytebell http://127.0.0.1:8080/mcp` |
| Claude Desktop | Add the JSON snippet below to your MCP config file                   |
| Cursor         | Same JSON snippet in `~/.cursor/mcp.json`                            |
| Continue       | Same JSON snippet in `~/.continue/config.json`                       |

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

The server registers `smart_search`, `keyword_lookup`, and `retrieve_file`, plus a bundled skill at `bytebell://skills/index` that the client can fetch and install once per session for the recommended workflow.

## What Bytebell does

You point `bytebell` at a repo. It clones the source, walks every file, and for each file calls an LLM (via OpenRouter) to extract a structured `FileAnalysis`: a one-paragraph **purpose**, a longer **summary** of what the file does and how it fits the architecture, a **business context** line tying it to the product domain, plus the file's classes, functions, keywords, and imports.

Those outputs are persisted into two stores:

- **Neo4j** receives a `:File` node enriched with `purpose`, `summary`, `businessContext`, `language`, `sha`, and `sizeBytes`, linked via `:HAS_CLASS`, `:HAS_FUNCTION`, `:HAS_KEYWORD`, `:HAS_IMPORT_INTERNAL`, and `:HAS_IMPORT_EXTERNAL` to deduplicated child nodes shared across the whole graph. Fulltext indexes cover purpose+summary, business context, keyword names, and class/function signatures.
- **MongoDB** receives the raw file content, language, SHA256, and the full `FileAnalysis` JSON for cite-back and exact retrieval.

LLM clients then query that graph through three MCP tools — `smart_search`, `keyword_lookup`, `retrieve_file` — which together cover fused semantic + structural search, reverse entity-to-file lookup, and targeted content reads. They let an agent answer questions like _"Which files implement our retry/backoff policy and where is it configured?"_ without reading the entire repo into context.

```mermaid
flowchart LR
    CLI["bytebell CLI / TUI"] -- HTTP --> Server["bytebell-server<br/>(Express)"]
    Client["MCP-capable LLM client<br/>Claude Code, Cursor, …"] -- MCP --> Server
    Server -- enqueues --> Q["BullMQ in-process worker"]
    Q --> Strategy["IngestionStrategy<br/>per-file LLM"]
    Strategy -- LLM call --> OR["OpenRouter"]
    Strategy -- raw + analysis --> Mongo[("MongoDB")]
    Strategy -- enriched node --> Neo[("Neo4j")]
    Server -. retrieval .-> Mongo
    Server -. retrieval .-> Neo
```

## Who this is for

- **Solo engineers and small teams** who want a Claude / Cursor / Continue session to _actually_ know their codebase — not just whatever the tool can fit in a context window — without sending source to a third party.
- **OSS communities and academic research groups** who need a durable, reproducible code-knowledge index they can re-index from a single command.
- **Anyone running an MCP-capable agent on a private codebase** where compliance, IP, or just personal preference rules out hosted RAG-over-your-repo SaaS.

It is **not** a hosted product, not a chat UI, and not a multi-tenant platform. There is exactly one tenant — `orgId="local"` — and the server binds to `127.0.0.1`. If you want hosted, multi-tenant, or commercial-use rights, see the [Enterprise](#enterprise) section.

## How it works

### Ingest

`bytebell index <url>` (or `bytebell ingest <path>`) submits a job to an in-process BullMQ queue. The worker dispatches to an `IngestionStrategy` — today, `BasicFileAnalysisStrategy` ([packages/ingest-github/src/BasicFileAnalysisStrategy.ts](packages/ingest-github/src/BasicFileAnalysisStrategy.ts)). It clones the repo to `~/.bytebell/repos/<knowledgeId>/`, walks every file, runs a per-file OpenRouter call, and persists raw content to Mongo + the enriched node to Neo4j.

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

`classes` and `functions` carry approximate line ranges so `retrieve_file` can later pull the right slice without re-reading the whole file. **Re-indexing is diff-aware**: on `bytebell pull`, the strategy compares each file's SHA256 to the prior `:File.sha` and only re-analyses files whose hash changed. LLM cost is proportional to actual code churn, not to repo size.

### Graph shape

```mermaid
graph LR
    K[":Knowledge"]
    F[":File<br/>purpose, summary,<br/>businessContext"]
    KW[":Keyword"]
    C[":Class"]
    Fn[":Function"]
    M[":Module"]
    K -- HAS_FILE --> F
    F -- HAS_KEYWORD --> KW
    F -- HAS_CLASS --> C
    F -- HAS_FUNCTION --> Fn
    F -- HAS_IMPORT_INTERNAL --> M
    F -- HAS_IMPORT_EXTERNAL --> M
```

One `:Knowledge` node per indexed repo owns its `:File` nodes. Each `:File` carries `purpose`, `summary`, `businessContext`, `language`, `sha`, `sizeBytes`, and a `relativePath` unique within its `knowledgeId`. From every file, the five `:HAS_*` edges link to deduplicated `:Keyword`, `:Class`, `:Function`, and `:Module` nodes that are global across the whole graph — the same library, the same exported function, the same domain term resolves to one node no matter how many repos reference it. Constraints make `(knowledgeId, relativePath)` unique on `:File`; fulltext indexes back the natural-language search side. Source: [packages/neo4j/src/files.ts](packages/neo4j/src/files.ts), [packages/neo4j/src/indexes.ts](packages/neo4j/src/indexes.ts).

There are no cross-file call edges in the current schema — that's a deliberate tradeoff for ingestion simplicity and language-agnostic ingest. Future strategies will add them, plugged in behind the same `IngestionStrategy` interface.

### Retrieval

Three MCP tools, registered at `http://127.0.0.1:8080/mcp`:

- **`smart_search(query, k=20)`** — fused six-channel search across File `purpose`/`summary`, `businessContext`, paths, keyword names, class/function signatures, and module imports. Returns deduplicated, ranked top-K files with folder clustering. Use first.
- **`keyword_lookup(term)`** — reverse lookup. A search term resolves to all matching named entities (keywords, classes, functions, module names) and the files linked to each.
- **`retrieve_file`** — three operations: `metadata` (purpose, summary, businessContext, classes/functions with line ranges, imports), `content` (read specific line ranges or search within one file with surrounding context), `bulk_search` (parallel scan of up to 50 files for a string).

```mermaid
flowchart TD
    Q["Question from agent"] --> SS["smart_search"]
    SS --> KL["keyword_lookup<br/>(optional)"]
    SS --> RM["retrieve_file metadata<br/>→ class/function line ranges"]
    KL --> RM
    RM --> RC["retrieve_file content<br/>→ exact line slice"]
    RC --> A["Cited answer"]
```

Most well-formed code questions resolve in 2–4 tool calls. No re-clone, no full-file dumps, no embeddings round-trip.

## Day-to-day commands

| Command                                                       | Purpose                                                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `bytebell ls`                                                 | List indexed knowledge entries with state.                                         |
| `bytebell stats`                                              | Ingestion totals, per-repo breakdown, per-commit token usage.                      |
| `bytebell mcp stats`                                          | MCP usage: input/output tokens, monthly breakdown.                                 |
| `bytebell pull`                                               | Re-index a previously-added GitHub repo at branch HEAD (diff-aware).               |
| `bytebell delete`                                             | Picker; cancels jobs, drops the Knowledge subgraph from Neo4j, removes Mongo rows. |
| `bytebell shutdown`                                           | Stop the server. Docker keeps running.                                             |
| `bytebell boot`                                               | Warm restart.                                                                      |
| `docker compose -f infra/docker/docker-compose.yml down [-v]` | Stop containers (and optionally drop volumes — destroys all indexed data).         |

Full reference, including every flag and option: [commands.md](commands.md).

## Bring your own infrastructure

By default, `bytebell boot` provisions a local Docker stack (`bytebell-mongo`, `bytebell-neo4j`, `bytebell-redis`) with auto-generated credentials. If you already run Mongo, Neo4j, and Redis (or want to use a managed service), set the connection details before booting and the Docker step is skipped:

```bash
bytebell set mongo-uri      mongodb://user:pass@host:27017/bytebell
bytebell set neo4j-uri      bolt://host:7687
bytebell set neo4j-user     neo4j
bytebell set neo4j-password <your-password>
bytebell set redis-url      redis://host:6379
```

Docker is not required on the host in this mode. See the [Configuration reference](#configuration-reference) for the full key list.

## Architecture at a glance

A single Bun-built Express daemon, `bytebell-server`, hosts the ingestion HTTP routes, the MCP transport (Streamable HTTP + SSE), and the BullMQ workers all in-process. The CLI is a thin Ink/React TUI that only ever talks HTTP to that daemon — it never touches Mongo, Neo4j, or Redis directly. Workers run in the server's lifecycle; there is no separate worker fleet.

For the full PRD — package tiers, state machine, HTTP route catalogue, verification checklist, distribution strategy — see [docs/arch.md](docs/arch.md).

## Configuration reference

Settings live in `~/.bytebell/config.json` and are written exclusively by `bytebell set <key> <value>` (or by first-run auto-fill on `bytebell boot`). Keys:

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

## Why this design — research grounding

> Comparing Bytebell to PageIndex, GitNexus, GraphRAG, Sourcegraph, or Augment Code? See **[comparison.md](comparison.md)** for a side-by-side feature table and pros / cons of each.

Bytebell's shape — _build a code graph at ingest time, enrich every node with LLM-derived structured semantics, then serve retrieval against the joined surface_ — tracks a converging body of recent work showing that purely structural retrieval (AST / call-graph) and purely semantic retrieval (embeddings) each leave large performance on the table, and that combining them at indexing time unlocks the gains.

**Graphs beat flat retrieval for code.** Repository-level graphs from AST + imports + call structure consistently outperform flat embedding retrieval on real engineering tasks.

- RepoGraph ([2410.14684](https://arxiv.org/abs/2410.14684), ICLR 2025) — +32.8% on SWE-bench.
- CodexGraph ([2408.03910](https://arxiv.org/abs/2408.03910), NAACL 2025) — agents query a code graph DB; beats similarity-only retrieval.
- CGM ([2505.16901](https://arxiv.org/abs/2505.16901)) — graph + node semantics; 43% on SWE-bench Lite.
- Citation-Grounded Code Comprehension ([2512.12117](https://arxiv.org/abs/2512.12117)) — argues LLM-only and embedding-only both fail; hybrid wins.

**LLM-generated semantic enrichment closes the vocabulary gap.** Identifiers and call edges don't capture intent — natural-language summaries on each node let retrieval match what a developer _means_, not just what the code _spells_.

- Tram ([2305.11074](https://arxiv.org/abs/2305.11074), ACL 2023) — semantic enrichment beats flat sentence-level retrieval.
- LLM Agents Improve Semantic Code Search ([2408.11058](https://arxiv.org/abs/2408.11058)) — LLM-injected metadata improves embedding-based retrieval.
- Knowledge-Graph-Based Repo-Level Code Generation ([2505.14394](https://arxiv.org/abs/2505.14394)) — graph captures structure; LLM context fills semantic gaps.
- Sense and Sensitivity ([2505.13353](https://arxiv.org/abs/2505.13353)) — lexical and semantic recall are different capabilities; supports the `summary` (semantic) vs Mongo raw (lexical) split.

**Structured summaries and hierarchy beat blob summarization.** Explicit fields — purpose, inputs, outputs, business context — aggregated bottom-up let retrieval match at the right level of abstraction. This maps directly onto Bytebell's `purpose` / `summary` / `businessContext` schema.

- Hierarchical Repo-Level Code Summarization for Business Applications ([2501.07857](https://arxiv.org/abs/2501.07857), ICSE LLM4Code 2025) — closest motivational match: structured per-unit summaries aggregated to file/package level, grounded in business context.
- Beyond Function Level ([2502.16704](https://arxiv.org/abs/2502.16704)) — class/repo context in summaries beats function-only.
- Code-Craft ([2504.08975](https://arxiv.org/abs/2504.08975)) — closest published peer; bottom-up LLM summaries from a code graph; +82% top-1 retrieval precision on 7,531 functions.
- Hierarchical Summarization (Springer 2025) — project/dir/file summaries at indexing time; Pass@10 of 0.89 on real Jira issues, beats flat retrieval and standard RAG.

**Hybrid structure + semantics, served as memory.** The most recent work converges on serving the joined graph through a memory-style retrieval interface — exactly what MCP gives us.

- Codebase-Memory ([2603.27277](https://arxiv.org/abs/2603.27277)) — MCP-served knowledge graph with LLM-derived metadata; reports 10× token reduction.

The design choices follow directly: each `:File` node carries LLM-generated semantics alongside `:HAS_CLASS` / `:HAS_FUNCTION` / `:HAS_KEYWORD` / `:HAS_IMPORT_*` edges (structure), and the three MCP tools fuse both surfaces at query time.

## Enterprise

Bytebell-public is the OSS edition. ByteBell also offers a separately-licensed **Enterprise** edition for organizations that need a commercial-use grant, hardening, and direct support. Enterprise typically includes:

- A commercial-use grant covering use by or on behalf of for-profit entities, including SaaS deployments and revenue-generating applications.
- Hardened multi-tenant deployment patterns, SSO / SCIM, audit logging, and data-isolation guarantees.
- Additional ingestion strategies (cross-file call graphs, dependency-graph extraction, PDF and design-doc ingestion) and additional MCP tools.
- Access to the managed ByteBell knowledge surface and connectors to internal sources (Confluence, Jira, Notion, GitHub Enterprise, …).
- Engineering support and SLAs for production deployments.

To discuss Enterprise licensing, evaluation, or services, contact `team@bytebell.ai`.

## Contributing

Hooks, commit conventions, and pre-push gates are documented in [contributing.md](contributing.md). Architectural rules — file-size limits, tier boundaries, the `README.md` requirement, the Bun-only and OpenRouter-only constraints — live in [CLAUDE.md](CLAUDE.md) and apply to every PR.

## License

Bytebell is released under **AGPL-3.0 with an additional non-commercial use clause** — see [LICENSE](LICENSE) for the authoritative text. Personal, academic, research, and non-profit use are unrestricted under AGPL-3.0 (network-copyleft applies). **Commercial use** is governed by license terms and is covered by the [Enterprise edition](#enterprise) (`team@bytebell.ai`). The running server itself does **not** verify a license; governance is by license terms, not by code. The server is meant for local single-tenant use — no remote network surface; everything binds to `127.0.0.1`.
