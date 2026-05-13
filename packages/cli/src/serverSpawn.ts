import { mkdir, open } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "@bb/types";
import { getConfigValue, isDevMode } from "@bb/config";
import { getLogsDir } from "@bb/logger";

const HEALTH_TIMEOUT_MS = 500;
const SPAWN_POLL_INTERVAL_MS = 200;
const SPAWN_MAX_POLLS = 50;

export class ServerStartTimeoutError extends Error {
  override readonly name = "ServerStartTimeoutError";
  readonly logPath: string;

  constructor(logPath: string) {
    super(`server didn't come up within ${(SPAWN_POLL_INTERVAL_MS * SPAWN_MAX_POLLS) / 1000}s. Check ${logPath}`);
    this.logPath = logPath;
  }
}

export async function ensureServerRunning(onProgress?: (line: string) => void): Promise<{
  alreadyRunning: boolean;
  logPath?: string;
  devModeMismatch?: boolean;
}> {
  if (await isHealthy()) {
    // The running server was spawned in whatever env existed at boot. We
    // can't introspect its environment from here, but if the CURRENT process
    // has BYTEBELL_DEV=1 set we surface a mismatch hint — without it, users
    // assume the running server picked up the toggle when it hasn't.
    return { alreadyRunning: true, devModeMismatch: isDevMode() };
  }
  const logPath = await spawnDetached();
  for (let i = 0; i < SPAWN_MAX_POLLS; i++) {
    if (onProgress !== undefined) {
      onProgress(`waiting for server health check (${i + 1}/${SPAWN_MAX_POLLS})`);
    }
    await sleep(SPAWN_POLL_INTERVAL_MS);
    if (await isHealthy()) {
      return { alreadyRunning: false, logPath };
    }
  }
  throw new ServerStartTimeoutError(logPath);
}

async function isHealthy(): Promise<boolean> {
  const port = getConfigValue(Config.ServerPort);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function spawnDetached(): Promise<string> {
  const logsDir = getLogsDir();
  await mkdir(logsDir, { recursive: true, mode: 0o700 });
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(logsDir, `server-${today}.log`);
  const fh = await open(logPath, "a");
  const entry = resolveServerEntry();
  const child = spawn("bun", ["--bun", entry], {
    stdio: ["ignore", fh.fd, fh.fd],
    detached: true,
  });
  child.unref();
  await fh.close();
  return logPath;
}

function resolveServerEntry(): string {
  const here = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(here), "..", "..", "server", "src", "index.ts");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
