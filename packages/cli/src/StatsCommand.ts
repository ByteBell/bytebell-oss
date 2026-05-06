import { Command } from "commander";
import type { StatsCommitEntry, StatsRepoEntry, StatsResponse } from "@bb/types";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { getJson, HttpClientError } from "./httpClient.ts";
import { error } from "./output.ts";

const COST_UNKNOWN = -1;

export function buildStatsCommand(): Command {
  const cmd = new Command("stats");
  cmd.description("Show ingestion totals, per-repo breakdown, and per-commit token usage.").action(runStats);
  return cmd;
}

async function runStats(): Promise<void> {
  try {
    const ctx = await ensureServerRunning();
    if (ctx.alreadyRunning === false && ctx.logPath !== undefined) {
      process.stderr.write(`(started server in background; logs: ${ctx.logPath})\n`);
    }
    const stats = await getJson<StatsResponse>("/api/v1/stats");
    renderTotals(stats);
    if (stats.repos.length > 0) {
      process.stdout.write("\nREPOS\n");
      renderRepos(stats.repos);
    }
    if (stats.commitStats.length > 0) {
      process.stdout.write("\nCOMMITS\n");
      renderCommits(stats.commitStats);
    }
  } catch (cause: unknown) {
    handleError(cause);
  }
}

function renderTotals(stats: StatsResponse): void {
  const t = stats.totals;
  process.stdout.write("TOTALS\n");
  process.stdout.write(`  repos             ${t.totalRepos}\n`);
  process.stdout.write(`  files             ${t.totalFiles}\n`);
  process.stdout.write(`  input tokens      ${t.totalInputTokens.toLocaleString()}\n`);
  process.stdout.write(`  output tokens     ${t.totalOutputTokens.toLocaleString()}\n`);
  process.stdout.write(`  estimated cost    ${formatCost(t.totalEstimatedCost)}\n`);
}

function renderRepos(repos: StatsRepoEntry[]): void {
  const headers = ["NAME", "TYPE", "FILES", "INPUT", "OUTPUT", "COST"];
  const rows = repos.map((r) => [
    r.repoName,
    r.type,
    String(r.fileCount),
    r.inputTokens.toLocaleString(),
    r.outputTokens.toLocaleString(),
    formatCost(r.estimatedCost),
  ]);
  writeTable(headers, rows);
}

function renderCommits(commits: StatsCommitEntry[]): void {
  const headers = ["NAME", "COMMIT", "INPUT", "OUTPUT", "COST", "TIME (ms)", "FILES"];
  const rows = commits.map((c) => [
    c.repoName,
    c.commitHash.slice(0, 8),
    c.inputTokens.toLocaleString(),
    c.outputTokens.toLocaleString(),
    formatCost(c.estimatedCost),
    String(c.processingTimeMs),
    String(c.filesAnalyzed),
  ]);
  writeTable(headers, rows);
}

function writeTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
  const writeRow = (cols: string[]): void => {
    process.stdout.write(cols.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ") + "\n");
  };
  writeRow(headers);
  for (const row of rows) {
    writeRow(row);
  }
}

function formatCost(value: number): string {
  if (value === COST_UNKNOWN) {
    return "unknown";
  }
  return `$${value.toFixed(6)}`;
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
