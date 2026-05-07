import { Command } from "commander";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getBytebellHome } from "@bb/config";
import { composeFilePath } from "./dockerInfra.ts";
import { createSpinner, error, success } from "./output.ts";

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

export function buildShutdownCommand(): Command {
  const cmd = new Command("shutdown");
  cmd.description("Stop the bytebell-server (docker infra is left running).").action(runShutdown);
  return cmd;
}

async function runShutdown(): Promise<void> {
  const pidFile = path.join(getBytebellHome(), "pid");
  const pid = await readPid(pidFile);
  if (pid === null) {
    success("server is not running.");
    process.stdout.write(dockerHint());
    return;
  }

  const spinner = createSpinner("Shutting down ByteBell server...");
  try {
    process.kill(pid, "SIGTERM");
  } catch (cause: unknown) {
    const code = (cause as { code?: string } | undefined)?.code;
    if (code === "ESRCH") {
      spinner.stop(true, "server pid file was stale; nothing to stop.");
      process.stdout.write(dockerHint());
      return;
    }
    spinner.stop(false, "Failed to send SIGTERM");
    error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
    return;
  }

  const drained = await waitForPidFileGone(pidFile);
  if (drained) {
    spinner.stop(true, `server (pid ${pid}) shut down gracefully.`);
  } else {
    spinner.stop(
      false,
      `server (pid ${pid}) did not exit within ${POLL_TIMEOUT_MS / 1000}s; not escalating to SIGKILL.`,
    );
    process.exitCode = 1;
  }
  process.stdout.write(dockerHint());
}

async function readPid(pidFile: string): Promise<number | null> {
  try {
    const raw = await readFile(pidFile, "utf8");
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function waitForPidFileGone(pidFile: string): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    if (!(await pidFileExists(pidFile))) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return !(await pidFileExists(pidFile));
}

async function pidFileExists(pidFile: string): Promise<boolean> {
  try {
    await stat(pidFile);
    return true;
  } catch {
    return false;
  }
}

function dockerHint(): string {
  return `\nDocker infra is still running. To stop it:\n  docker compose -f ${composeFilePath()} down\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
