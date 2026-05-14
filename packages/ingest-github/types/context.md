# `types/` — context

## Tier

Hand-written type declarations for the package's public surface. Consumed by
TypeScript via `package.json` `"types": "./types/index.d.ts"`. Not executed at
runtime — runtime resolves through `package.json` `"main": "./src/index.ts"`.

## Responsibility

Provide a stable, loosely-typed declaration of every public export of
`@bb/ingest-github`. The shim short-circuits TypeScript before it walks into
`src/`, which uses package-local `src/*` path aliases that don't resolve under
a consumer's tsconfig context.

Without this shim, any external project that imports `@bb/ingest-github` and
runs `tsc -b` would trip on `TS2307: Cannot find module 'src/types/foo.ts'`
errors from the package's internal imports.

## Public interface

`./index.d.ts` declares every exported symbol of the runtime `src/index.ts`.
Function signatures are intentionally permissive (`(...args: any[]) => any` in
many cases) — full type fidelity is sacrificed for resolution stability.

When `src/index.ts` adds or renames a public export, this file must be updated
in the same commit.

## Invariants

1. **Never imported by `src/`.** This is a consumer-facing artifact only.
2. **Mirror of `src/index.ts` exports.** A symbol exported here that doesn't
   exist in `src/index.ts` is a leak; a symbol exported from `src/` but not
   here will appear as `any` to consumers at best, or break their typecheck
   at worst.
3. **No runtime code.** Pure `.d.ts` declarations.

## What is intentionally out of scope

- Full structural types for complex shapes (use `any` / `unknown`)
- Generic constraints (keep signatures flat)
- Documentation comments (the source is authoritative)
