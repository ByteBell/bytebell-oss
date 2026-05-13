# `@bb/redis` — context

## Tier

Infrastructure. May depend on Kernel (`@bb/types` for the `Config` enum,
`@bb/errors` for typed error classes) and on infra siblings explicitly
listed in `package.json` (`@bb/config` for `Config.RedisUrl`). May be
imported by Strategy (`@bb/queue` — the primary consumer), Domain, and
Binaries — never by `@bb/cli` (CLI talks HTTP only).

## Responsibility

The package owns:

- A single shared `ioredis` client (lazy, idempotent connect; graceful
  close)
- A health probe (`pingRedis`) backed by the active connection
- An internal `_getRedis()` accessor that future consumers (chiefly
  `@bb/queue`) will compose against

The package does **not** own:

- BullMQ Queue / Worker / QueueEvents construction (`@bb/queue`)
- Caching helpers, dedupe sets, distributed locks (deferred — see
  _How to extend_)
- Pub/sub helpers (deferred — BullMQ manages its own internal pub/sub
  clients from the connection options)
- Telemetry, logging, retry policies (the driver handles transport retries)

## Public exports

```ts
function connectRedis(): Promise<void>;
function closeRedis(): Promise<void>;
function pingRedis(): Promise<PingResult>;
function getRedisConnection(): RedisConnectionOptions;

interface PingResult {
  ok: boolean;
  latencyMs: number;
}
interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db: number;
  tls?: object;
  maxRetriesPerRequest: null;
  enableReadyCheck: false;
}
```

`getRedisConnection()` returns a BullMQ-compatible options blob (parsed
from `Config.RedisUrl`) for `@bb/queue` to construct its own `Queue` and
`Worker` instances — BullMQ instantiates separate internal redis clients
per Queue/Worker rather than reusing a single shared client. The shared
client owned by this package remains for `pingRedis()` and any future
non-queue redis use.

`_getRedis()` is **internal** — consumed only by helpers inside this
package. Higher tiers cannot reach a raw `Redis` handle today.

## Data ownership

The single shared `ioredis` client. No knowledge of queue keys, cache keys,
or any application-level redis schema lives here.

## Invariants

1. **No env reads.** The Redis URL comes from
   `getConfigValue(Config.RedisUrl)`. No `process.env`, no `.env`, no
   fallback. Enforced repo-wide by
   [eslint.config.mjs:71-94](../../eslint.config.mjs#L71-L94).
2. **`connectRedis()` is idempotent and concurrent-safe.** Repeated calls
   return the existing client; concurrent calls await the same in-flight
   connect promise.
3. **`closeRedis()` is graceful.** Clears the cached client before awaiting
   `client.quit()` so a subsequent `connectRedis()` cleanly re-establishes.
4. **Errors are typed, not strings.** `RedisConfigError` carries the exact
   `bytebell set …` hint; `RedisConnectError` redacts userinfo in the URL.
5. **No raw `Redis` leaks.** `_getRedis()` is not in `src/index.ts`. The
   only way higher tiers touch redis is through helpers exported from this
   package.
6. **BullMQ-compatible options.** The shared client is constructed with
   `maxRetriesPerRequest: null` and `enableReadyCheck: false` so that
   `@bb/queue`'s blocking workers (which use BLPOP-family commands) work
   correctly. This is deliberate: the queue is the dominant consumer per
   [docs/arch.md:74-76](../../docs/arch.md#L74-L76).

## External dependencies

- `ioredis` — the standard BullMQ-compatible redis client
- `@bb/config` — workspace dep, only for `getConfigValue(Config.RedisUrl)`
- `@bb/types` — workspace dep, for the `Config` enum
- `@bb/errors` — workspace dep, for `RedisConfigError`,
  `RedisConnectError`, `RedisNotConnectedError`

No logger, no telemetry, no Mongo, no Neo4j. This package boots after
`@bb/config` and before everything that needs the queue.

## What is intentionally out of scope (v0)

- BullMQ Queue/Worker/QueueEvents construction (`@bb/queue`)
- Caching helpers / typed key-value wrappers
- Distributed locks
- Dedicated subscriber / publisher clients (BullMQ creates its own
  internally; non-queue pub/sub consumers do not exist yet)
- Application-level retry / backoff / timeout tuning (ioredis defaults
  apply; revisit if the queue shows flakiness)

## How to extend

Adding a typed cache helper (`cacheGet` / `cacheSet`) when a non-queue
consumer arrives:

1. Create `src/cache/<name>.ts`.
2. Use `_getRedis()` to obtain the client; never expose the raw `Redis`
   handle to callers.
3. Re-export the helper (and any new public types) from `src/index.ts`.
4. Update this `README.md`.
