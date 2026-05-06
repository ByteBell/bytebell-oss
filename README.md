# Bytebell

Local, single-tenant knowledge engine. Ingests GitHub repos into a Neo4j graph and exposes them to MCP-capable LLM clients (Claude Code, Claude Desktop, Cursor, …) over a local HTTP endpoint. Everything runs on your machine — no cloud, no telemetry, no auth.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1 — the runtime + workspace manager.
- [Docker](https://www.docker.com/) — for Mongo + Neo4j + Redis (managed by `bytebell boot`).
- An [OpenRouter](https://openrouter.ai) API key — used by the file analyser.

## Install

```bash
git clone https://github.com/your-org/bytebell-public.git
cd bytebell-public
bun install
cd packages/cli && bun link && cd ../..
```

After `bun link`, `bytebell` is on your `PATH`. Verify with `bytebell --help`.

## Configure (one-time)

Two values you have to set yourself:

```bash
bytebell set openrouter-api-key sk-or-…
bytebell set openrouter-model anthropic/claude-sonnet-4.6
```

Everything else (Mongo URI, Neo4j URI/user/password, Redis URL, server port) is auto-filled the first time you `bytebell boot`. The Neo4j password is freshly generated and stored in `~/.bytebell/config.json` (mode `0600`).

## Boot

```bash
bytebell boot
```

What happens:

1. Pre-flight check — refuses to start if either OpenRouter key is blank.
2. Auto-fills any missing infra config keys with local-docker defaults; generates a Neo4j password if one isn't set.
3. `docker compose up -d` brings up `bytebell-mongo`, `bytebell-neo4j`, `bytebell-redis` (named volumes — data persists across reboots).
4. Polls `docker compose ps` until all three services report `healthy`.
5. Spawns `bytebell-server` (HTTP on `127.0.0.1:8080`, MCP at `/mcp`).

First boot pulls images, so it may take a couple of minutes. Subsequent boots are fast.

## Index a repository

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
# 87067fbe…  github:org/your-repo    PROCESSING  2026-05-06 00:11  0
```

States flow `CREATED → QUEUED → INGESTED → PROCESSING → PROCESSED`. When the row reads `PROCESSED`, the graph is fully populated and the MCP tools will return results.

You can also ingest a local directory:

```bash
bytebell ingest /path/to/source-tree
```

## Inspect token & cost stats

```bash
bytebell stats
```

Shows totals (input tokens, output tokens, estimated USD cost), a per-repo breakdown, and per-commit rows including processing time and files analysed. Cost is computed against live OpenRouter pricing; entries whose model has no published pricing show as `unknown`.

## Delete an indexed entry

```bash
bytebell delete
```

Lists every indexed knowledge entry as an arrow-keyable picker. Selecting one and confirming `y` cancels any pending BullMQ jobs for that knowledge, removes the Knowledge subgraph from Neo4j (`DETACH DELETE`), and removes the Mongo `knowledge`, `raw`, and `processing_stats` rows tagged with that id. Press `Esc` (or `n` at the confirm step) to cancel.

## Connect an MCP client

The MCP endpoint is at `http://127.0.0.1:8080/mcp` (Streamable HTTP). For Claude Code:

```bash
claude mcp add --transport http bytebell http://127.0.0.1:8080/mcp
```

For other clients (Claude Desktop / Cursor / Continue), add this to your MCP config:

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

The server registers three tools — `smart_search`, `keyword_lookup`, `retrieve_file` — plus a bundled skill at `bytebell://skills/index` that the client can fetch and install once per session for the recommended workflow.

## Stop & re-boot

```bash
bytebell shutdown   # stops the server only — Docker keeps running
bytebell boot       # warm restart, fast
```

To stop the containers too:

```bash
docker compose -f infra/docker/docker-compose.yml down
```

Add `-v` to also drop the named volumes (destroys all indexed data).

## Where things live

- `~/.bytebell/config.json` — runtime config (URIs, OpenRouter key, log level, …)
- `~/.bytebell/repos/<knowledgeId>/…` — cloned source trees for every indexed repo
- `~/.bytebell/logs/server-YYYY-MM-DD.log` — daily server log
- `~/.bytebell/pid` — running server PID (unlinked on graceful shutdown)
- `infra/docker/.env` — generated; contains the Neo4j password (gitignored)

## License

Open source under the project's licence — but the running server is meant for local single-tenant use. No remote network surface; everything binds to `127.0.0.1`.
