import { unlink } from "node:fs/promises";
import path from "node:path";
import { closeMongo } from "@bb/mongo";
import { closeRedis } from "@bb/redis";
import { closeNeo4j } from "@bb/neo4j";
import { closeQueue } from "@bb/queue";
import { closeAllMcpSessions } from "@bb/mcp";
import { getBytebellHome } from "@bb/config";

const SHUTDOWN_TIMEOUT_MS = 30_000;

export function installShutdownHandlers(): void {
  const handler = (signal: string): void => {
    void shutdown(signal);
  };
  process.on("SIGTERM", () => handler("SIGTERM"));
  process.on("SIGINT", () => handler("SIGINT"));
}

async function shutdown(signal: string): Promise<void> {
  process.stderr.write(`Received ${signal}, shutting down…\n`);
  const timer = setTimeout(() => {
    process.stderr.write(`Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit.\n`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  try {
    await closeAllMcpSessions();
    await closeQueue();
    await closeRedis();
    await closeNeo4j();
    await closeMongo();
    await unlink(path.join(getBytebellHome(), "pid")).catch(() => undefined);
  } catch (cause: unknown) {
    process.stderr.write(`Shutdown error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exit(1);
  }
  process.exit(0);
}
