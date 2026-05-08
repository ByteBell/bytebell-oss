import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  JobType,
  KnowledgeState,
  type GithubIndexPayload,
  type GithubPullPayload,
  type JobMessage,
  type LocalIngestPayload,
} from "@bb/types";
import {
  deleteRawFiles,
  getKnowledge,
  listRawFileShas,
  recordProcessingStats,
  setKnowledgeCommit,
  setKnowledgeState,
} from "@bb/mongo";
import { deleteFileNodes, setKnowledgeStateInGraph, snapshotFilesToVersion } from "@bb/neo4j";
import { registerWorker } from "@bb/queue";
import { estimateCostFromBreakdown } from "@bb/llm";
import { IngestError, KnowledgeNotFoundError } from "@bb/errors";
import { ensureReposRoot, repoCloneDir } from "./paths.ts";
import { gitClone } from "./clone.ts";
import { BasicFileAnalysisStrategy } from "./BasicFileAnalysisStrategy.ts";
import type { IngestionResult, IngestionStrategy } from "./Strategy.ts";

const exec = promisify(execFile);

const DEFAULT_BRANCH = "main";

const STRATEGY: IngestionStrategy = new BasicFileAnalysisStrategy();

export function registerGithubWorkers(): void {
  registerWorker(JobType.GithubIndex, handleGithubIndex);
  registerWorker(JobType.GithubPull, handleGithubPull);
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
    const commitHash = await readCommitHash(destDir);
    if (commitHash === "unknown") {
      // Without an anchored SHA, future pulls cannot diff against this index —
      // fail the job rather than land in a state that silently breaks pull idempotency.
      throw new IngestError(knowledgeId, "could not resolve HEAD commit hash after clone");
    }
    const result = await STRATEGY.ingest({ knowledgeId, rootDir: destDir });
    await persistStats({
      knowledgeId,
      repoName: repoNameFromUrl(repoUrl),
      commitHash,
      result,
      startedAt,
    });
    // Anchor the commit so subsequent pulls can early-bail and build the
    // FileVersion history chain. Errors here must surface — silent failure
    // would leave commitHashes unset and break every future pull.
    await setKnowledgeCommit(knowledgeId, commitHash);
    await transitionState(knowledgeId, KnowledgeState.Processed);
  } catch (cause: unknown) {
    await transitionState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    throw new IngestError(knowledgeId, `github_index handler failed: ${describe(cause)}`, cause);
  }
}

/**
 * GITHUB_PULL handler — incremental.
 *
 * Re-clones the branch HEAD, diffs each scanned file's content sha against
 * the previously-indexed `raw_files.sha` map, and runs LLM analysis only on
 * paths that were added or whose sha changed. Paths that disappeared from
 * the new tree are deleted from Mongo + Neo4j after being snapshotted into
 * `:FileVersion(commitHash = previous commitId)`.
 *
 * Idempotency: if the resolved HEAD SHA is already in the recorded
 * `commitHashes`, the worker bails before doing any work.
 *
 * The `latestCommitHash` payload field is a hint only — the worker reads the
 * authoritative SHA via `git rev-parse HEAD` after clone.
 */
async function handleGithubPull(msg: JobMessage<GithubPullPayload>): Promise<void> {
  const { knowledgeId, gitToken } = msg.payload;
  await transitionState(knowledgeId, KnowledgeState.Processing);
  const startedAt = Date.now();
  try {
    const knowledge = await getKnowledge(knowledgeId);
    if (knowledge === null) {
      throw new KnowledgeNotFoundError(knowledgeId);
    }
    if (knowledge.source.kind !== "github") {
      throw new IngestError(knowledgeId, `pull is only supported for github knowledge (kind=${knowledge.source.kind})`);
    }
    const { repoUrl, branch, commitId: previousCommitId, commitHashes = [] } = knowledge.source;
    const effectiveBranch = branch ?? DEFAULT_BRANCH;

    await ensureReposRoot();
    const destDir = repoCloneDir(knowledgeId);
    await gitClone({
      repoUrl,
      branch: effectiveBranch,
      destDir,
      ...(gitToken !== undefined ? { gitToken } : {}),
    });

    const headHash = await readCommitHash(destDir);
    if (headHash !== "unknown" && commitHashes.includes(headHash)) {
      await transitionState(knowledgeId, KnowledgeState.Processed);
      return;
    }

    // Preserve prior `:File` state under `:FileVersion(previousCommitId)` before
    // the strategy mutates live nodes or we delete vanished ones. Skipped on the
    // first-ever pull where there is no previous commit anchored.
    if (previousCommitId !== undefined && previousCommitId.length > 0) {
      await snapshotFilesToVersion({ knowledgeId, commitHash: previousCommitId }).catch(() => undefined);
    }

    const priorShas = await listRawFileShas(knowledgeId);
    const result = await STRATEGY.ingest({ knowledgeId, rootDir: destDir, priorShas });

    const deletedPaths: string[] = [];
    for (const path of priorShas.keys()) {
      if (!result.seenPaths.has(path)) {
        deletedPaths.push(path);
      }
    }
    if (deletedPaths.length > 0) {
      await deleteRawFiles(knowledgeId, deletedPaths);
      await deleteFileNodes(knowledgeId, deletedPaths);
    }

    await persistStats({
      knowledgeId,
      repoName: repoNameFromUrl(repoUrl),
      commitHash: headHash,
      result,
      startedAt,
    });
    if (headHash !== "unknown") {
      await setKnowledgeCommit(knowledgeId, headHash);
    }
    await transitionState(knowledgeId, KnowledgeState.Processed);
  } catch (cause: unknown) {
    await transitionState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    throw new IngestError(knowledgeId, `github_pull handler failed: ${describe(cause)}`, cause);
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
  // `totalFiles` is the total count present in the repo (analyzed + skipped),
  // distinct from `filesAnalyzed` which is the work the LLM actually did.
  const totalFiles = input.result.filesAnalyzed + input.result.filesSkipped;
  await recordProcessingStats({
    knowledgeId: input.knowledgeId,
    repoName: input.repoName,
    commitHash: input.commitHash,
    modelTokens: input.result.modelTokens,
    estimatedCost,
    totalBatches: 1,
    totalFiles,
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
