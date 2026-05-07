import { Command } from "commander";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { getJson, HttpClientError, postJson } from "./httpClient.ts";
import { createProgressBar, createSpinner, error, type ProgressBar } from "./output.ts";

interface IndexResponse {
  knowledgeId: string;
  jobId: string;
}

export function buildIndexCommand(): Command {
  const cmd = new Command("index");
  cmd
    .description("Index a remote git repository.")
    .argument("<git-url>", "https URL of the repository")
    .option("--branch <name>", "branch to index (defaults to 'main' on the server)")
    .option("--token <pat>", "GitHub PAT for private repos")
    .action(runIndex);
  return cmd;
}

async function runIndex(gitUrl: string, options: { branch?: string; token?: string }): Promise<void> {
  if (!/^https?:\/\//u.test(gitUrl)) {
    error(`invalid git URL: ${gitUrl}`, "expected https://… form");
    process.exitCode = 1;
    return;
  }
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
    const body: Record<string, string> = { repoUrl: gitUrl };
    if (options.branch !== undefined) {
      body["branch"] = options.branch;
    }
    if (options.token !== undefined) {
      body["gitToken"] = options.token;
    }
    const response = await postJson<IndexResponse>("/api/v1/github/index", body);
    await pollJobStatus(response.knowledgeId, response.jobId);
  } catch (cause: unknown) {
    handleError(cause);
  }
}

interface RepoStatus {
  knowledgeId: string;
  state: string;
  fileCount: number;
  totalFiles?: number;
  processedFiles?: number;
}

async function pollJobStatus(knowledgeId: string, jobId: string): Promise<void> {
  const spinner = createSpinner(`Indexing knowledge ${knowledgeId} (job ${jobId})...`);
  let bar: ProgressBar | null = null;
  const pollInterval = 1500;

  while (true) {
    try {
      const status = await getJson<RepoStatus>(`/api/v1/repos/${knowledgeId}`);

      if (status.totalFiles !== undefined && status.totalFiles > 0) {
        if (bar === null) {
          spinner.stop(true, `Starting ingestion for ${knowledgeId}`);
          bar = createProgressBar(`Ingesting ${knowledgeId}`);
        }
        bar.update(status.processedFiles ?? 0, status.totalFiles, `Ingesting ${knowledgeId}`);
      } else {
        spinner.update(`Indexing: ${status.state}${status.fileCount > 0 ? ` (${status.fileCount} files)` : ""}`);
      }

      if (status.state === "PROCESSED") {
        if (bar) {
          bar.stop(true, `Successfully indexed ${knowledgeId} (${status.fileCount} files)`);
        } else {
          spinner.stop(true, `Successfully indexed ${knowledgeId} (${status.fileCount} files)`);
        }
        return;
      }
      if (status.state === "FAILED") {
        if (bar) {
          bar.stop(false, `Indexing failed for ${knowledgeId}`);
        } else {
          spinner.stop(false, `Indexing failed for ${knowledgeId}`);
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
