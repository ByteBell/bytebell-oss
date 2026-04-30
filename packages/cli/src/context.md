# `@bb/cli/src` — context

Implementation of `@bb/cli`. See [../context.md](../context.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — binary entry. Shebang `#!/usr/bin/env bun`.
  Constructs the commander `Command("bytebell")`, wires version + the
  `set` subcommand via `buildSetCommand()`, calls `parseAsync`. Top-level
  `try/catch` prints any uncaught error and exits `2` (the typed-error
  path through commander handlers exits `1`).
- **[SetCommand.ts](SetCommand.ts)** — the `set` subcommand. Two
  optional positional args. Both provided → headless flow: looks up
  `KEY_MAP[key]`, runs `entry.setter(value)`, prints success (or the
  redacted form for password-bearing keys). Neither provided → renders
  `<SetupForm />` via `ink.render`. Mismatched args → friendly error.
- **[keyMap.ts](keyMap.ts)** — the dispatch table from CLI key strings
  to typed `setConfigValue<K>` calls. Each entry is a closure that owns
  its own type narrowing — no `as` casts at the call site. Local
  helpers `parsePort` / `parsePositiveInt` / `parseLogLevel` throw
  `Error("Invalid value for \"<key>\": …")` which `SetCommand` pretty-
  prints with the matching `bytebell set …` hint from `@bb/config`'s
  `HINTS`. Keys deliberately absent: `openrouter_model` and
  `openrouter_api_key` (own subcommands).
- **[output.ts](output.ts)** — three small print helpers:
  `success(line)`, `error(line, hint?)`, `list(label, items)`. Manual
  ANSI escapes wrapped behind a `stream.isTTY` check. Plain text on
  non-TTY (CI, pipes).
- **[Field.tsx](Field.tsx)** — single Ink row component used inside
  `SetupForm`. Renders an indicator + label + either an `ink-text-input`
  (when focused) or a static text view of the value (when not). Masking
  via `ink-text-input`'s `mask` prop on the password row; non-focused
  view shows `•••…` for masked rows. Renders an inline red error line
  underneath when the field's `validate` returns a non-null string.
- **[SetupForm.tsx](SetupForm.tsx)** — the Ink form rendered by
  `bytebell set` no-args. Six rows declared in a `ROWS` constant: Mongo
  URI / Neo4j URI / Neo4j user / Neo4j password (masked) / Redis URL /
  Server port. Each row carries its own format-only `validate` regex.
  State: a single `useState<Record<string,string>>` keyed by row id and
  seeded from `loadConfig()` so users see and edit existing settings.
  Navigation via Ink's built-in `useFocusManager` (Tab / Shift-Tab). On
  Enter when all rows pass validation, iterates the dispatch table in
  row order calling `entry.setter(value)`. On Esc, exits without saving.

## Module dependency graph

```
output.ts       → (leaf — no imports)
keyMap.ts       → @bb/types (Config), @bb/config (LOG_LEVELS, setConfigValue, LogLevel)
Field.tsx       → ink, ink-text-input, react (type-only)
SetupForm.tsx   → ink, react, @bb/types (Config), @bb/config (getConfigValue),
                  keyMap.ts (KEY_MAP), Field.tsx (Field)
SetCommand.ts   → commander, react, ink (render), @bb/config (HINTS),
                  keyMap.ts (KEY_MAP, validKeysList), SetupForm.tsx (SetupForm),
                  output.ts (error, list, success)
index.ts        → commander, SetCommand.ts (buildSetCommand), output.ts (error)
```

No cycles. `output.ts` is a leaf; `keyMap.ts` is a near-leaf. Components
flow Field → SetupForm → SetCommand → index.

## Invariants enforced here

- **Shebang lives only in `index.ts`.** It is the binary entry; other
  files are imported.
- **Headless setter calls go through `KEY_MAP[key].setter`.** No file
  outside `keyMap.ts` calls `setConfigValue` directly. This keeps the
  type-narrowing closures the single source of truth and keeps password
  redaction (`entry.redact`) co-located with the setter.
- **Form runs format-only validation.** No network, no driver imports.
  Validators in `SetupForm.tsx`'s `ROWS` are pure regex / range checks.
- **Submit is atomic per call but not per form.** The form iterates
  six setters; each is its own atomic `setConfigValue` write. If one
  throws mid-loop, the form re-renders with the row's error highlighted
  and earlier fields stay written. Trade-off: rolling back partial
  writes would require a transaction abstraction in `@bb/config` that
  doesn't exist; the form's per-field format validation makes mid-loop
  failures essentially impossible in practice.
- **No raw `setConfigValue` casts.** Each `KEY_MAP` closure invokes
  `setConfigValue<Config.X>(Config.X, value)` so TypeScript checks the
  value type against `ConfigValueMap[Config.X]`. Adding a key without
  a closure (or with a wrong-type setter) is a compile error.
- **No env reads anywhere.** Repo-wide ESLint rule blocks `process.env`.

## Adding a Field

1. Add a row to `ROWS` in `SetupForm.tsx` — `{ id, label, cliKey, mask?, validate }`.
2. Confirm `KEY_MAP[cliKey]` exists in `keyMap.ts` (add it there if not).
3. Add the new key to the `loadInitial()` seed object so the field
   pre-populates from the existing config.
4. The form auto-renders the row in declaration order; no other
   wiring needed.
