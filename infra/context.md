# `infra/` — context

## Purpose

Operational artefacts that are not TypeScript workspace packages.
Today this dir holds the local Docker compose stack used by
`bytebell boot`. Future additions might include a Helm chart, a
production Compose file, or platform-specific service files —
each in its own subdirectory with its own `context.md`.

`infra/` is **not** part of the Bun workspace and never appears in
`tsconfig.json` references. Code under `packages/cli/` consumes
`infra/docker/` via `child_process` only — no imports cross the
boundary.

## Subdirectories

- [`docker/`](docker/context.md) — three-service `docker-compose.yml`
  (Mongo + Neo4j + Redis) plus the gitignored `.env` file the CLI
  generates on first boot. Versions pinned at the major level
  (`mongo:7`, `neo4j:5`, `redis:7-alpine`).

## Adding a new infra artefact

1. Create `infra/<name>/` with a `context.md` describing the contract,
   versions, lifecycle, and which CLI command consumes it.
2. If the artefact is consumed by the CLI, route the orchestration
   through a small dedicated module under `packages/cli/src/` (mirror
   the `dockerInfra.ts` pattern). Never import the new artefact from
   any TypeScript package — keep `infra/` outside the import graph.
