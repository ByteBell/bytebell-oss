# `@bb/mcp` — context

## Tier

Domain. Imports `@bb/neo4j` (read primitive `runCypher`), `@bb/config`
(`getBytebellHome`), `@bb/types` for shared shapes, and `zod` +
`@modelcontextprotocol/sdk`. Does not import from sibling domain
packages or from binaries (`@bb/server`, `@bb/cli`).

## Responsibility

Owns the public MCP retrieval surface. Builds a single `McpServer`
instance from `@modelcontextprotocol/sdk`, mounts both Streamable HTTP
(`/mcp`) and legacy SSE (`/sse` + `/sse/messages`) transports onto an
externally-supplied Express application, registers four retrieval
tools and a skill-distribution resource channel.

The package owns:

- A single shared `McpServer` instance (lazy, idempotent build) named
  `bytebell-public`, version pulled from this `package.json`.
- Per-session `StreamableHTTPServerTransport` instances keyed by
  `mcp-session-id`. New sessions are created on initialize requests;
  existing sessions are looked up by header.
- Per-session `SSEServerTransport` instances keyed by the SDK-generated
  `sessionId`, exposed via a query param on `/sse/messages`.
- Four registered tools — `list_knowledge`, `smart_search`,
  `keyword_lookup`, `retrieve_file` — registered via the modern
  `server.registerTool(...)` config-object API. `list_knowledge` is
  registered first so it sits at the top of `tools/list` output and
  the LLM gravitates toward calling it before anything else.
- Two resources — `bytebell://skills/index` (JSON listing of bundled
  skills) and `bytebell://skills/{skillName}/{filename}` (individual
  markdown file content). Backed by the bundled `skills/` directory
  beside `package.json`.
- Graceful shutdown — `closeAllMcpSessions()` closes every active
  transport so `@bb/server`'s shutdown hook can complete cleanly.

The package does **not** own:

- Auth gating. MCP is unauthenticated in the OSS engine —
  single-tenant, localhost-only. See [docs/mcp.md](../../docs/mcp.md)
  "Transport and mounting".
- Mongo or LLM access. The retrieval tools are pure
  graph-and-disk reads.
- HTTP body parsing — relies on `@bb/server`'s top-level `express.json`.

## Public exports

```ts
function mountMcp(app: express.Application): void;
function closeAllMcpSessions(): Promise<void>;
```

`mountMcp` is idempotent — calling it twice on the same app is a
no-op.

## Routes mounted

```
POST   /mcp                         Streamable HTTP — initialize / requests / responses
GET    /mcp                         Streamable HTTP — server-to-client streaming
DELETE /mcp                         Streamable HTTP — session terminate

GET    /sse                         SSE — open a long-lived stream
POST   /sse/messages?sessionId=…    SSE — client-to-server messages
```

## Tools

| Name             | Inputs                                                                                           | Output shape                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_knowledge` | `page?`                                                                                          | `{knowledgeBases: [{knowledgeId, repoName, sourceKind, sourceUrl, branch, state, fileCount, createdAt, updatedAt}], totalItems, pagination}` |
| `smart_search`   | `query`, `knowledgeId?`, `path?`, `exclude?`, `page?`, `pageSize?`                               | `{query, channels_used, total_matches, repos_matched[], top_results[], clusters[]}`                                                          |
| `keyword_lookup` | `term`, `match? (default keyword)`, `knowledgeId?`, `keywordLimit?`, `filesPerKeyword?`, `page?` | `{query, match, cross_repo, total_matched, matched[], pagination}`                                                                           |
| `retrieve_file`  | `operation? (default content)`, `knowledgeId`, op-specific params                                | `{operation, …}` — varies by op                                                                                                              |

`list_knowledge` is the session-start tool. One Cypher over
`(:Knowledge)` with an `OPTIONAL MATCH (:HAS_FILE)->(:File)` aggregate
returns one row per indexed repo, ordered by `Knowledge.updatedAt` desc.
Pagination packs rows into pages until a ~5000-token char budget is hit
(same shape as `keyword_lookup`'s pager). The `state` field flows
`CREATED → QUEUED → INGESTED → PROCESSING → PROCESSED | FAILED`; the
LLM should treat any state other than `PROCESSED` as not-yet-queryable.

`smart_search` runs the six channels in parallel via
`smartSearchChannels.ts` (purpose, paths, keywords, classes, functions,
imports). `smartSearchFusion.ts` normalizes per-channel scores against
the channel max, applies fixed weights (purpose 0.30, paths 0.20,
keywords 0.20, classes 0.15, functions 0.10, imports 0.05), dedupes by
`(knowledgeId, path)`, attaches `repoName` from `Knowledge` in one
post-fusion Cypher, and computes folder clusters in JS (top-two-segments
grouping — no `FolderNode` dependency).

`keyword_lookup` is a reverse lookup. For `match: keyword | class |
function` it uses the appropriate fulltext index; for `match: module`
it uses a plain `CONTAINS` over `Module.name`. Pagination packs
matched-entity entries into pages until a ~5000-token char budget is
hit.

`retrieve_file` has three operations:

- `metadata` — `relativePaths[]` (≤ 10) → single Cypher that joins
  `File` to its outgoing edges, returning per-file `{purpose, summary,
classes[], functions[], imports[], keywords[], language, sizeBytes}`.
- `content` — single `relativePath` + optional `fromLine`/`toLine` /
  `search` / `contextLines` / `maxTokens`. Reads from
  `~/.bytebell/repos/{knowledgeId}/{relativePath}` via `repoFs.ts`,
  slices in process, prepends line numbers, trims to the token char
  budget.
- `bulk_search` — `paths[]` (≤ 50) + required `search` + optional
  `contextLines` / `matchOnly`. Parallel disk scan; returns matched +
  noMatch + errored.

## Resources

`bytebell://skills/index` — JSON listing of bundled skills, generated
on each request from disk. Each entry: `{name, description (parsed
from SKILL.md frontmatter), install_path, files: [{filename, bytes}]}`.

`bytebell://skills/{skillName}/{filename}` — markdown content for a
single skill file. URI templating handled by the SDK.

The bundled directory is `<package>/skills/` (relative to `package.json`).
Resolution uses `import.meta.url` so the layout works in dev (`bun run`)
and from a built output. `skills/bytebell/SKILL.md` and
`skills/bytebell/bytebell-code-search.md` are the two files shipped in v1.

## Data ownership

- Transient: per-session transport objects in two module-scoped `Map`s
  (one per transport flavour). Cleared on `transport.onclose` /
  `res.on("close")`, or by `closeAllMcpSessions`.
- Read-only access to the graph through `@bb/neo4j`'s `runCypher` and
  to the local clone directory through `@bb/config`'s
  `getBytebellHome()`. No writes.

## Invariants

1. **One `McpServer` instance per process.** `mountMcp` uses a
   module-level guard so repeat calls do not rebuild.
2. **No `process.env` reads.** Tunable thresholds live as module-level
   constants for v1; promote to `@bb/config` when configurability is
   actually needed.
3. **No auth.** v1 ships unauthenticated. A future paid-tier could
   wrap the same `mountMcp` in a token check at the binary layer.
4. **Transports are owned, not leaked.** Every transport created here
   either lives in the per-flavour `Map` or has been closed.
   `closeAllMcpSessions` drains both maps.
5. **Disk I/O is path-traversal safe.** `repoFs.ts` rejects absolute
   paths, `..` components, and any resolved target outside
   `<bytebellHome>/repos/{knowledgeId}/`.
6. **No non-null assertions, no `any`, no dynamic `import()`.** Repo-wide
   strict-types rules apply — see CLAUDE.md.
7. **Tool input types use `field?: T | undefined`.** The Zod-inferred
   shapes the SDK emits use `T | undefined` for optional fields; under
   `exactOptionalPropertyTypes` we must echo that on our own input
   interfaces.

## External dependencies

- `@modelcontextprotocol/sdk@^1.23.0` — official TypeScript SDK
- `zod@^4.3.6` — input schemas for `registerTool`
- `@types/express` (dev) — types only; no express runtime dep
- `@bb/neo4j` (workspace) — `runCypher` for all read queries
- `@bb/config` (workspace) — `getBytebellHome` for the clone directory
- `@bb/types` (workspace) — shared shapes (no direct usage in v1, kept
  for upcoming tier integrations)

## How to extend

Adding a tool:

1. Create `src/<toolName>Tool.ts` exporting
   `register<ToolName>Tool(server: McpServer): void`. Use
   `server.registerTool(name, { description, inputSchema }, cb)` (the
   non-deprecated overload).
2. Declare the input interface with `field?: T | undefined` for every
   optional Zod field.
3. Call the new register fn from `buildMcpServer()` in `src/server.ts`.
4. Wire any new infra dep into `package.json`.
5. Update _Tools_ + _Files_ in this context and in `src/context.md`.

Adding a resource:

1. Create `src/resources<Name>.ts` exporting
   `register<Name>Resources(server: McpServer): void`.
2. Same wiring as tools — call from inside `buildMcpServer()`.
