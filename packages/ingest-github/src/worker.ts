import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { JobType, KnowledgeState, type GithubIndexPayload, type JobMessage, type LocalIngestPayload } from "@bb/types";
import { recordProcessingStats, setKnowledgeState } from "@bb/mongo";
import { setKnowledgeStateInGraph } from "@bb/neo4j";
import { registerWorker } from "@bb/queue";
import { estimateCostFromBreakdown } from "@bb/llm";
import { IngestError } from "@bb/errors";
import { ensureReposRoot, repoCloneDir } from "./paths.ts";
import { gitClone } from "./clone.ts";
import { BasicFileAnalysisStrategy } from "./BasicFileAnalysisStrategy.ts";
import type { IngestionResult, IngestionStrategy } from "./Strategy.ts";

const exec = promisify(execFile);

const DEFAULT_BRANCH = "main";

const STRATEGY: IngestionStrategy = new BasicFileAnalysisStrategy();

export function registerGithubWorkers(): void {
  registerWorker(JobType.GithubIndex, handleGithubIndex);
}

export function registerLocalIngestWorker(): void {
  registerWorker(JobType.LocalIngest, handleLocalIngest);
}

async function handleGithubIndex(msg: JobMessage<GithubIndexPayload>): Promise<void> {
  const { knowledgeId, repoUrl, branch, gitToken } = msg.payload;
  await transitionState(knowledgeId, KnowledgeState.Processing);
  const startedAt = Date.now();
  try {
    await ensureReposRoot();
    const destDir = repoCloneDir(knowledgeId);
    await gitClone({
      repoUrl,
      branch: branch ?? DEFAULT_BRANCH,
      destDir,
      ...(gitToken !== undefined ? { gitToken } : {}),
    });
    const result = await STRATEGY.ingest({ knowledgeId, rootDir: destDir });
    const commitHash = await readCommitHash(destDir);
    await persistStats({
      knowledgeId,
      repoName: repoNameFromUrl(repoUrl),
      commitHash,
      result,
      startedAt,
    });
    await transitionState(knowledgeId, KnowledgeState.Processed);
  } catch (cause: unknown) {
    await transitionState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    throw new IngestError(knowledgeId, `github_index handler failed: ${describe(cause)}`, cause);
  }
}

async function handleLocalIngest(msg: JobMessage<LocalIngestPayload>): Promise<void> {
  const { knowledgeId, rootDir } = msg.payload;
  await transitionState(knowledgeId, KnowledgeState.Processing);
  const startedAt = Date.now();
  try {
    const result = await STRATEGY.ingest({ knowledgeId, rootDir });
    await persistStats({
      knowledgeId,
      repoName: localRepoName(rootDir),
      commitHash: `local-${startedAt}`,
      result,
      startedAt,
    });
    await transitionState(knowledgeId, KnowledgeState.Processed);
  } catch (cause: unknown) {
    await transitionState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    throw new IngestError(knowledgeId, `local_ingest handler failed: ${describe(cause)}`, cause);
  }
}

interface PersistStatsInput {
  knowledgeId: string;
  repoName: string;
  commitHash: string;
  result: IngestionResult;
  startedAt: number;
}

async function persistStats(input: PersistStatsInput): Promise<void> {
  const estimatedCost = await estimateCostFromBreakdown(input.result.modelTokens);
  await recordProcessingStats({
    knowledgeId: input.knowledgeId,
    repoName: input.repoName,
    commitHash: input.commitHash,
    modelTokens: input.result.modelTokens,
    estimatedCost,
    totalBatches: 1,
    totalFiles: input.result.filesAnalyzed,
    totalFolders: 0,
    filesAnalyzed: input.result.filesAnalyzed,
    processingTimeMs: Date.now() - input.startedAt,
  });
}

async function transitionState(knowledgeId: string, state: KnowledgeState): Promise<void> {
  await setKnowledgeState(knowledgeId, state);
  await setKnowledgeStateInGraph(knowledgeId, state).catch(() => undefined);
}

async function readCommitHash(repoDir: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-C", repoDir, "rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

function repoNameFromUrl(repoUrl: string): string {
  try {
    const segments = new URL(repoUrl).pathname
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const repo = segments.at(-1)?.replace(/\.git$/u, "");
    const owner = segments.at(-2);
    if (owner !== undefined && repo !== undefined) {
      return `${owner}/${repo}`;
    }
  } catch {
    // fall through
  }
  return repoUrl;
}

function localRepoName(rootDir: string): string {
  const segments = rootDir.split("/").filter((s) => s.length > 0);
  return segments.at(-1) ?? rootDir;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
