# `@bb/redis/src` — context

Implementation of `@bb/redis`. See [../README.md](../README.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — public re-exports. The only entry point other
  packages may import. Exposes `connectRedis`, `closeRedis`, `pingRedis`,
  `getRedisConnection`, and the `PingResult` / `RedisConnectionOptions`
  types. Anything not re-exported here is internal.
- **[client.ts](client.ts)** — module-scoped `Redis` singleton plus the
  lifecycle (`connectRedis`, `closeRedis`), the health probe (`pingRedis`),
  the BullMQ-options provider (`getRedisConnection`), and the **internal**
  `_getRedis()` accessor. Reads the URL via
  `getConfigValue(Config.RedisUrl)` from `@bb/config` + `@bb/types`. Throws
  typed errors from `@bb/errors` (`RedisConfigError`, `RedisConnectError`,
  `RedisNotConnectedError`). Also exposes `__resetForTests()` — test seam
  only, never imported by production code.

## Module dependency graph

```
client.ts → ioredis, @bb/config (getConfigValue), @bb/types (Config),
            @bb/errors (Redis* error classes)
index.ts  → re-exports the public surface from client.ts
```

No cycles, no intra-package leaves yet — `client.ts` is the only
implementation file.

## Invariants enforced here

- **Connect is idempotent and concurrent-safe.** `connectRedis()`
  short-circuits if `client !== null`; concurrent callers await the same
  in-flight `connecting` promise so a single connect is performed.
- **Close is graceful and re-entrant.** `closeRedis()` clears the cached
  client before awaiting `client.quit()` so a subsequent `connectRedis()`
  cleanly re-establishes; calling `closeRedis()` twice is a no-op.
- **Lazy connect.** The `ioredis` client is constructed with
  `lazyConnect: true` and explicitly `await client.connect()`-ed inside
  `doConnect()`. This makes connect failures surface as a rejected promise
  from `connectRedis()` rather than as an uncaught `"error"` event on the
  client.
- **BullMQ-compatible defaults.** `maxRetriesPerRequest: null` and
  `enableReadyCheck: false` are baked in so that `@bb/queue`'s blocking
  workers do not need to override them.
- **No raw `Redis` leak.** `_getRedis()` is not in `index.ts`. Future
  helpers (cache wrappers, queue-connection accessor) will live in this
  folder and compose `_getRedis()` internally; consumers in higher tiers
  see only the typed helper signatures.
- **No env reads.** Only `getConfigValue(Config.RedisUrl)` provides the
  URL. Repo-wide ESLint rule blocks `process.env`.
- **Errors carry typed metadata.** Construction sites use the catalog in
  `@bb/errors` — never inline `new Error(string)`. `RedisConfigError`
  carries the exact `bytebell set …` hint; `RedisConnectError` redacts
  userinfo in the URL before composing the message.

## Adding a helper

Follow the recipes in [../README.md](../README.md) under _How to extend_.
Cache helpers (e.g. `cacheGet` / `cacheSet`) live as flat files in
`src/<name>.ts` (the repo's ESLint rule forbids parent traversal, so
subdirectories require import gymnastics — keep `src/` flat unless the
package outgrows it). Compose `_getRedis()`; never expose the raw `Redis`
handle.
