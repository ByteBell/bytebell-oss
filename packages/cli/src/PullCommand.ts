import { Command } from "commander";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { getJson, HttpClientError, postJson } from "./httpClient.ts";
import { createProgressBar, createSpinner, error, info, type ProgressBar } from "./output.ts";
import { startLogTailer, type LogTailer } from "./logTailer.ts";

interface PullResponse {
  knowledgeId: string;
  jobId?: string;
  noOp?: boolean;
  commitHash?: string;
}

interface RepoStatus {
  knowledgeId: string;
  state: string;
  fileCount: number;
  totalFiles?: number;
  processedFiles?: number;
}

export function buildPullCommand(): Command {
  const cmd = new Command("pull");
  cmd
    .description("Re-index an already-added GitHub repo at the branch's current HEAD.")
    .argument("<knowledge-id>", "knowledge id returned by `bytebell index`")
    .option("--commit <sha>", "specific commit hash to anchor against (defaults to branch HEAD)")
    .option("--token <pat>", "GitHub PAT for private repos")
    .option("--verbose", "stream the server log file to the terminal during the run")
    .action(runPull);
  return cmd;
}

async function runPull(
  knowledgeId: string,
  options: { commit?: string; token?: string; verbose?: boolean },
): Promise<void> {
  if (knowledgeId.length === 0) {
    error("knowledge id is required");
    process.exitCode = 1;
    return;
  }
  let tailer: LogTailer | null = null;
  try {
    let ctx: Awaited<ReturnType<typeof ensureServerRunning>>;
    if (
      await fetch(`http://127.0.0.1:${getConfigValue(Config.ServerPort)}/health`)
        .then((r) => r.ok)
        .catch(() => false)
    ) {
      ctx = await ensureServerRunning();
    } else {
      const spinner = createSpinner("Starting ByteBell server in background...");
      ctx = await ensureServerRunning((line) => spinner.update(line));
      spinner.stop(true, `Server started (logs: ${ctx.logPath ?? "n/a"})`);
    }
    if (options.verbose === true) {
      tailer = await startLogTailer("server");
    }

    const body: Record<string, string> = { knowledgeId };
    if (options.commit !== undefined) {
      body["latestCommitHash"] = options.commit;
    }
    if (options.token !== undefined) {
      body["gitToken"] = options.token;
    }
    const response = await postJson<PullResponse>("/api/v1/github/pull", body);

    if (response.noOp === true) {
      info(`No-op: knowledge ${knowledgeId} already at commit ${response.commitHash ?? "(unknown)"}`);
      return;
    }
    if (response.jobId === undefined) {
      error(`Pull was not enqueued for knowledge ${knowledgeId}`);
      process.exitCode = 1;
      return;
    }
    await pollJobStatus(response.knowledgeId, response.jobId);
  } catch (cause: unknown) {
    handleError(cause);
  } finally {
    if (tailer !== null) {
      await tailer.stop();
    }
  }
}

async function pollJobStatus(knowledgeId: string, jobId: string): Promise<void> {
  const spinner = createSpinner(`Pulling knowledge ${knowledgeId} (job ${jobId})...`);
  let bar: ProgressBar | null = null;
  const pollInterval = 1500;

  while (true) {
    try {
      const status = await getJson<RepoStatus>(`/api/v1/repos/${knowledgeId}`);

      if (status.totalFiles !== undefined && status.totalFiles > 0) {
        if (bar === null) {
          spinner.stop(true, `Re-ingesting ${knowledgeId}`);
          bar = createProgressBar(`Re-ingesting ${knowledgeId}`);
        }
        bar.update(status.processedFiles ?? 0, status.totalFiles, `Re-ingesting ${knowledgeId}`);
      } else {
        spinner.update(`Pulling: ${status.state}${status.fileCount > 0 ? ` (${status.fileCount} files)` : ""}`);
      }

      if (status.state === "PROCESSED") {
        if (bar) {
          bar.stop(true, `Successfully pulled ${knowledgeId} (${status.fileCount} files)`);
        } else {
          spinner.stop(true, `Successfully pulled ${knowledgeId} (${status.fileCount} files)`);
        }
        return;
      }
      if (status.state === "FAILED") {
        if (bar) {
          bar.stop(false, `Pull failed for ${knowledgeId}`);
        } else {
          spinner.stop(false, `Pull failed for ${knowledgeId}`);
        }
        return;
      }
    } catch (cause: unknown) {
      const msg = `Failed to poll status: ${cause instanceof Error ? cause.message : String(cause)}`;
      if (bar) {
        bar.stop(false, msg);
      } else {
        spinner.stop(false, msg);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

function handleError(cause: unknown): void {
  if (cause instanceof ServerStartTimeoutError) {
    error(cause.message);
  } else if (cause instanceof HttpClientError) {
    error(cause.message);
  } else {
    error(cause instanceof Error ? cause.message : String(cause));
  }
  process.exitCode = 1;
}
