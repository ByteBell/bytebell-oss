import { Command } from "commander";
import { Config } from "@bb/types";
import { HINTS, getConfigValue } from "@bb/config";
import { applyInfraDefaults, checkPreflight } from "./bootConfig.ts";
import {
  DockerComposeError,
  DockerHealthTimeoutError,
  DockerNotFoundError,
  composeFilePath,
  up,
} from "./dockerInfra.ts";
import { ServerStartTimeoutError, ensureServerRunning } from "./serverSpawn.ts";
import { createSpinner, error, success } from "./output.ts";

export function buildBootCommand(): Command {
  const cmd = new Command("boot");
  cmd.description("Bring up Docker infra (mongo + neo4j + redis) and start the bytebell-server.").action(runBoot);
  return cmd;
}

async function runBoot(): Promise<void> {
  if (!enforcePreflight()) {
    process.exitCode = 1;
    return;
  }

  const defaults = applyInfraDefaults();
  for (const entry of defaults.written) {
    if (entry.redacted) {
      success(`set ${entry.cliKey}=<redacted> (auto-generated)`);
    } else {
      success(`set ${entry.cliKey} (auto-filled with local-docker default)`);
    }
  }

  if (defaults.neo4jPassword.length === 0) {
    error("internal: neo4j password is empty after applyInfraDefaults — refusing to start docker.");
    process.exitCode = 1;
    return;
  }

  const dockerSpinner = createSpinner("Starting Docker infrastructure...");
  try {
    const result = await up({
      neo4jPassword: defaults.neo4jPassword,
      onProgress: (line) => {
        dockerSpinner.update(`Docker: ${line}`);
      },
    });
    dockerSpinner.stop(true, `Docker infra is up (${composeFilePath()})`);
    success(`mongo  → ${result.services.mongo}`);
    success(`neo4j  → ${result.services.neo4j}`);
    success(`redis  → ${result.services.redis}`);
  } catch (cause: unknown) {
    dockerSpinner.stop(false, "Docker startup failed");
    handleDockerError(cause);
    return;
  }

  let serverContext: Awaited<ReturnType<typeof ensureServerRunning>>;
  const serverSpinner = createSpinner("Starting ByteBell server...");
  try {
    serverContext = await ensureServerRunning((line) => {
      serverSpinner.update(`Server: ${line}`);
    });
    if (serverContext.alreadyRunning) {
      serverSpinner.stop(true, `Server already running`);
    } else {
      serverSpinner.stop(true, `Server started (logs: ${serverContext.logPath ?? "n/a"})`);
    }
  } catch (cause: unknown) {
    serverSpinner.stop(false, "Server startup failed");
    if (cause instanceof ServerStartTimeoutError) {
      error(cause.message);
    } else {
      error(cause instanceof Error ? cause.message : String(cause));
    }
    process.exitCode = 1;
    return;
  }

  const port = getConfigValue(Config.ServerPort);
  success(`MCP endpoint: http://127.0.0.1:${port}/mcp`);
  process.stdout.write("\nNext: bytebell index <git-url>  or  bytebell ingest [path]\n");
}

function enforcePreflight(): boolean {
  const result = checkPreflight();
  if (result.ok) {
    return true;
  }
  for (const entry of result.missing) {
    error(`${entry.hintKey} is not set`, HINTS[entry.configKey]);
  }
  return false;
}

function handleDockerError(cause: unknown): void {
  if (cause instanceof DockerNotFoundError) {
    error(cause.message);
  } else if (cause instanceof DockerComposeError) {
    error(cause.message);
  } else if (cause instanceof DockerHealthTimeoutError) {
    error(cause.message);
  } else {
    error(cause instanceof Error ? cause.message : String(cause));
  }
  process.exitCode = 1;
}
