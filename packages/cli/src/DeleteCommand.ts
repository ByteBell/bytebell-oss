import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { deleteJson, getJson, HttpClientError } from "./httpClient.ts";
import { DeleteSelector, type DeleteSelectorItem } from "./DeleteSelector.tsx";
import { error, success } from "./output.ts";

interface RepoEntry {
  knowledgeId: string;
  source: { kind: "github"; repoUrl: string; branch?: string } | { kind: "local"; sourcePath: string };
  state: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

interface ListResponse {
  repos: RepoEntry[];
}

interface DeleteResponse {
  knowledgeId: string;
  jobsRemoved: number;
  mongoDeleted: number;
  rawDeleted: number;
  statsDeleted: number;
}

export function buildDeleteCommand(): Command {
  const cmd = new Command("delete");
  cmd.description("Pick an indexed knowledge entry and delete it from Mongo + Neo4j.").action(runDelete);
  return cmd;
}

async function runDelete(): Promise<void> {
  try {
    const ctx = await ensureServerRunning();
    if (ctx.alreadyRunning === false && ctx.logPath !== undefined) {
      process.stderr.write(`(started server in background; logs: ${ctx.logPath})\n`);
    }
    const { repos } = await getJson<ListResponse>("/api/v1/repos");
    if (repos.length === 0) {
      process.stdout.write(
        "No indexed knowledge yet. Run `bytebell index <url>` or `bytebell ingest [path]` to add one.\n",
      );
      return;
    }
    const items = repos.map(toItem);
    const picked = await pickItem(items);
    if (picked === null) {
      process.stderr.write("cancelled\n");
      return;
    }
    const response = await deleteJson<DeleteResponse>(`/api/v1/repos/${encodeURIComponent(picked.knowledgeId)}`);
    success(
      `removed ${picked.label} (raw: ${response.rawDeleted}, stats: ${response.statsDeleted}, jobs: ${response.jobsRemoved})`,
    );
  } catch (cause: unknown) {
    handleError(cause);
  }
}

async function pickItem(items: DeleteSelectorItem[]): Promise<DeleteSelectorItem | null> {
  return new Promise<DeleteSelectorItem | null>((resolve) => {
    const onDone = (result: { picked?: DeleteSelectorItem; cancelled?: boolean }): void => {
      if (result.picked !== undefined) {
        resolve(result.picked);
        return;
      }
      resolve(null);
    };
    const { waitUntilExit } = render(React.createElement(DeleteSelector, { items, onDone }));
    waitUntilExit().catch(() => undefined);
  });
}

function toItem(repo: RepoEntry): DeleteSelectorItem {
  return {
    knowledgeId: repo.knowledgeId,
    label: formatSource(repo.source),
    detail: `${repo.state}  ${repo.knowledgeId.slice(0, 8)}…  ${repo.fileCount} files`,
  };
}

function formatSource(source: RepoEntry["source"]): string {
  if (source.kind === "github") {
    const slug = parseGithubSlug(source.repoUrl);
    const suffix = source.branch !== undefined && source.branch.length > 0 ? `@${source.branch}` : "";
    return `github:${slug}${suffix}`;
  }
  return `local:${source.sourcePath}`;
}

function parseGithubSlug(repoUrl: string): string {
  try {
    const u = new URL(repoUrl);
    return u.pathname.replace(/^\/+/u, "").replace(/\.git$/u, "");
  } catch {
    return repoUrl;
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
