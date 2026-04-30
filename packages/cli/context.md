# `@bb/cli` — context

## Tier

Binary (deployable). Top of the import graph alongside `@bb/server`.
Depends on Kernel (`@bb/types`, `@bb/errors`) and Infrastructure
(`@bb/config`). Imported by no other workspace package — published as the
user-facing `bytebell` binary.

May **not** import `@bb/server`, `@bb/queue`, `@bb/mongo`, `@bb/redis`,
`@bb/llm`, `@bb/ingest-github`, or `@bb/logger`. The CLI talks HTTP to a
running `bytebell-server` (when subcommands need server state) and
otherwise operates only on `~/.bytebell/` via `@bb/config`.

## Responsibility

The user-facing terminal UI for Bytebell. Arch-spec'd at
[docs/arch.md _TUI Spec_ §144-184](../../docs/arch.md#L144-L184) — single
mode, every invocation is interactive in spirit, with subcommands for
indexing, configuration, server lifecycle, and inspection.

**v0 surface:** the `set` flow only.

- `bytebell set <key> <value>` — headless write to
  `~/.bytebell/config.json` via `@bb/config.setConfigValue`. Type
  coercion + Zod validation + atomic `tmp → fsync → rename`. Sole
  sanctioned write path per [docs/arch.md:140](../../docs/arch.md#L140).
- `bytebell set` (no args) — Ink setup form. Walks Mongo / Neo4j /
  Neo4j-user / Neo4j-password / Redis / Port with field-level format
  validation. On submit, applies all six values atomically through the
  same `setConfigValue` path. Esc cancels.
- `bytebell --help` / `--version` — commander defaults.

The package does **not** own:

- Any other subcommand (index, ls, clean, models, keys, cost, server,
  mcp, telemetry, update) — all deferred per the catalog below.
- Live infra connection probes — the CLI cannot import `@bb/mongo` /
  `@bb/redis` per the tier rule. Format-only validation in v0; future
  `bytebell config doctor` will probe via a running server.
- License issuance ([docs/arch.md:96-99](../../docs/arch.md#L96-L99)) —
  separate subsystem.
- The Ink dashboard (`bytebell` no-args) — needs the server's HTTP API
  - activity feed.
- OpenRouter API key handling — own subcommand (`bytebell keys set`)
  with `keytar` keychain backing.

## Public exports

`@bb/cli` is a binary, not a library. Its only contract is the `bin`
entry in `package.json`:

```jsonc
{ "bin": { "bytebell": "./src/index.ts" } }
```

Publish-time builds swap to `./dist/index.js`. v0 dev workflow runs the
TS file directly via Bun's `#!/usr/bin/env bun` shebang; install with
`cd packages/cli && bun link` to put `bytebell` on `PATH`.

The TypeScript module exports (`buildSetCommand`, `KEY_MAP`, etc.) are
**internal** — no other workspace package imports `@bb/cli`.

## Data ownership

None directly. The CLI is a thin shell over `@bb/config`'s atomic
writer — it owns no module state, no caches, no on-disk artifacts of its
own. `~/.bytebell/config.json` is `@bb/config`'s data; CLI just writes
through it.

## Invariants

1. **No env reads.** No `process.env`. The setter primitive enforces
   this; the CLI is a transparent caller.
2. **Atomic writes.** Every successful `set` invocation triggers
   `setConfigValue` which writes via `tmp → fsync → rename` at mode
   `0600` in dir `0700`.
3. **Tier discipline.** No imports from `@bb/server`, `@bb/queue`,
   `@bb/mongo`, `@bb/redis`, `@bb/llm`, `@bb/ingest-github`. Blocked
   structurally (no workspace dep) and by ESLint boundary rule.
4. **Redaction in stdout.** Password-bearing keys
   (today: `neo4j-password`) print `<redacted>` on success — the raw
   value never appears in stdout / stderr / logs.
5. **No headless `openrouter-*`.** `openrouter_api_key` and
   `openrouter_model` deliberately aren't in `KEY_MAP`; they have
   dedicated subcommands per arch.
6. **Format-only validation in v0.** The setup form's per-field
   validators check shape (`mongodb://`, `bolt://`, integer port, etc.)
   but never make network calls.
7. **TUI naming convention.** `*Command.ts` for commander handlers
   (plain TS), `*Form.tsx` / `*Pane.tsx` for Ink components (JSX).
   Per [CLAUDE.md _Naming Conventions_](../../CLAUDE.md).

## External dependencies

- `commander` — argv parsing + subcommand wiring
- `ink` + `react` — Ink TUI runtime (React for terminals)
- `ink-text-input` — controlled text input field
- Workspace deps: `@bb/config`, `@bb/errors`, `@bb/types`

No `chalk` / `kleur` / `picocolors` — manual ANSI escapes wrapped
behind a `tty?` check (see `output.ts`).

## Full TUI catalog (planned interface)

The complete arch-spec'd command surface, grouped by what each command
will touch when implemented. Only the **bolded** entries ship in v0.

| Invocation                                        | Behavior                                                                                                             | When it lands                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **`bytebell set <key> <value>`**                  | **Headless write via `setConfigValue`. v0.**                                                                         | **This PR**                                 |
| **`bytebell set`**                                | **Ink setup form (6 infra fields). v0.**                                                                             | **This PR**                                 |
| `bytebell`                                        | Ink dashboard with Repos / Server / Activity / Cost panes ([docs/arch.md:172-184](../../docs/arch.md#L172-L184))     | After `@bb/server` HTTP API + activity feed |
| `bytebell` (first-run auto-launch of setup form)  | If `isConfigComplete()` returns false, redirect to `bytebell set` form ([docs/arch.md:170](../../docs/arch.md#L170)) | After dashboard lands                       |
| `bytebell index <git-url> [--branch] [--token]`   | POST `/api/v1/github/index` to local `bytebell-server`                                                               | After `@bb/server`                          |
| `bytebell index --local <path>`                   | Tar-stream to `/api/v1/local/index`                                                                                  | After `@bb/server` + local-index route      |
| `bytebell ls`                                     | Ink table from GET `/api/v1/repos`                                                                                   | After `@bb/server`                          |
| `bytebell clean <id-or-name>`                     | Confirm prompt → DELETE via server admin route                                                                       | After `@bb/server` clean route              |
| `bytebell models set <model-id>`                  | Validate model via OpenRouter API + write `openrouter_model`                                                         | After OpenRouter helper                     |
| `bytebell models ls`                              | Curated 5-10 models, on-the-fly OpenRouter pricing                                                                   | Same                                        |
| `bytebell keys set`                               | Interactive masked prompt → `keytar` keychain → write key                                                            | After `keytar` integration                  |
| `bytebell cost`                                   | Read `~/.bytebell/cost-ledger.sqlite` via `bun:sqlite`, render breakdowns                                            | After cost ledger lands in `@bb/llm`        |
| `bytebell server start \| stop \| status \| logs` | Spawn / kill / inspect `bytebell-server`, tail server logs                                                           | After `@bb/server` binary                   |
| `bytebell mcp`                                    | Print MCP endpoint URL + sample MCP-client config                                                                    | After `@bb/server` MCP route                |
| `bytebell telemetry status`                       | Read telemetry buffer ndjson stats                                                                                   | After `@bb/telemetry`                       |
| `bytebell update`                                 | Detect install method, run matching update, restart server                                                           | Release-engineering follow-up               |

## What is intentionally out of scope (v0)

- Every TUI surface in the table above except `set` and the help/version
  defaults
- Live connection probes inside the setup form
- First-run auto-launch of setup form (needs the dashboard pane first)
- OpenRouter API key in the setup form (separate `bytebell keys set`)
- License auto-issue on first run
- Tests — workspace has no test infra yet
- Color theming via `kleur` / `picocolors` — manual ANSI for now
- Distinct exit codes per failure mode (today: `1` = typed/handled error,
  `2` = uncaught crash)

## How to extend

Adding a new subcommand:

1. Create `src/<Name>Command.ts` (PascalCase, plain `.ts`) exporting
   `build<Name>Command(): Command`.
2. If interactive panes / forms are needed: add `src/<Name>Form.tsx`
   (or `<Name>Pane.tsx`) per [CLAUDE.md _Naming Conventions_](../../CLAUDE.md).
3. Wire into `src/index.ts`: `program.addCommand(build<Name>Command())`.
4. If the command speaks to `bytebell-server`: HTTP only (e.g. `fetch`
   to `http://localhost:<server_port>`). Never import `@bb/server`.
5. If the command needs OS primitives (`keytar`, `bun:sqlite`,
   `child_process`): add the dep to `package.json`, but never import a
   domain / strategy / infra-non-config workspace package.
6. Update _Public exports_ / _Out of scope_ in this file and the table
   above — move the row from "deferred" to "shipped".

Adding a new headless `set` key:

1. Add a `Config` enum entry in `@bb/types/src/config.ts` (and the
   schema / hint in `@bb/config`).
2. Add a `KEY_MAP` entry in `src/keyMap.ts`. The closure form keeps
   `setConfigValue<K>(key, ConfigValue<K>)` strictly typed.
3. If the key is interactive-form-relevant: add a `Row` to the
   `ROWS` array in `src/SetupForm.tsx` with a `validate` function.
