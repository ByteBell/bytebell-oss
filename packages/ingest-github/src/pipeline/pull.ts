import { Config, KnowledgeState, type GithubPullPayload, type JobMessage } from "@bb/types";
import { getConfigValue } from "@bb/config";
import { getKnowledge, recordProcessingStats, setKnowledgeCommit, setKnowledgeState } from "@bb/mongo";
import { setKnowledgeStateInGraph, snapshotFilesToVersion, type NodeScope } from "@bb/neo4j";
import { estimateCostFromBreakdown, type AskLlmOptions } from "@bb/llm";
import { IngestError, KnowledgeNotFoundError } from "@bb/errors";
import { logger } from "@bb/logger";
import { ensureMetaDirs, metaPathsFor, repoCloneDir, ensureReposRoot } from "./paths.ts";
import { readHeadCommitHash, syncRepository } from "./source.ts";
import { CancellationError, clearCancellation, throwIfCancelled } from "./cancellation.ts";
import { assertReachableFromBranch, checkoutCommit, type DiffResult } from "./git-diff.ts";
import { computePullDiff, materialiseEndpoints } from "./pull-diff-resolver.ts";
import { affectedFoldersFromDiff } from "./affected-folders.ts";
import { createDiskSourceReader } from "./disk-source-reader.ts";
import type { PullFactory, SourceReader, ArchiveSink } from "src/types/pipeline.ts";
import { analyseChangedFiles } from "src/strategies/flat-folder/analyse-changed.ts";
import { processBigFilesQueue } from "src/strategies/flat-folder/phases/process-big-files.ts";
import { backfillMissingFields } from "src/strategies/flat-folder/backfill/fields.ts";
import { backfillBigFiles } from "src/strategies/flat-folder/backfill/big-files.ts";
import { runSelectiveFolderSummary } from "src/strategies/flat-folder/folder-summary-selective.ts";
import { makeRepoSummaryEnvelope, persistRepoSummary, summariseRepo } from "src/strategies/flat-folder/repo-summary.ts";
import { storePullAnalysis } from "src/strategies/flat-folder/store-pull.ts";
import { createLlmFileAnalyzer } from "src/adapters/llm-file-analyzer.ts";
import {
  COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT,
  buildFileAnalysisUserPrompt,
} from "src/strategies/flat-folder/prompts/file-analysis.ts";

const COMMIT_HASH_RE = /^[0-9a-f]{40}$/u;

function resolveOrgId(payload: { orgId?: string }): string {
  if (typeof payload.orgId === "string" && payload.orgId.length > 0) {
    return payload.orgId;
  }
  return getConfigValue(Config.OrgId);
}

function llmCallContextFromPayload(payload: {
  llmApiKey?: string;
  llmProvider?: string;
  llmModel?: string;
}): AskLlmOptions | undefined {
  const ctx: AskLlmOptions = {};
  if (payload.llmApiKey !== undefined && payload.llmApiKey.length > 0) {
    ctx.apiKey = payload.llmApiKey;
  }
  if (payload.llmProvider === "openrouter" || payload.llmProvider === "ollama") {
    ctx.provider = payload.llmProvider;
  }
  if (payload.llmModel !== undefined && payload.llmModel.length > 0) {
    ctx.model = payload.llmModel;
  }
  return Object.keys(ctx).length > 0 ? ctx : undefined;
}

export async function runPull(msg: JobMessage<GithubPullPayload>, pullFactory?: PullFactory): Promise<void> {
  const { knowledgeId } = msg.payload;
  if (msg.payload.targetCommitHash !== undefined && !COMMIT_HASH_RE.test(msg.payload.targetCommitHash)) {
    throw new IngestError(
      knowledgeId,
      `targetCommitHash must be a 40-character hex SHA, got: ${msg.payload.targetCommitHash}`,
    );
  }

  const knowledge = await getKnowledge(knowledgeId);
  if (knowledge === null) {
    throw new KnowledgeNotFoundError(knowledgeId);
  }
  if (knowledge.source.kind !== "github") {
    throw new IngestError(knowledgeId, `pull is only supported for github knowledge (kind=${knowledge.source.kind})`);
  }
  const currentCommit = knowledge.source.commitId ?? "";
  if (currentCommit.length === 0) {
    throw new IngestError(
      knowledgeId,
      "pull requires a previously-indexed commit; this knowledge has no commitId. Run github_index first.",
    );
  }

  const branch = knowledge.source.branch ?? "main";
  const repoUrl = knowledge.source.repoUrl;
  const gitToken = msg.payload.gitToken;

  clearCancellation(knowledgeId);
  const startedAt = Date.now();
  await transitionState(knowledgeId, KnowledgeState.Processing);

  try {
    throwIfCancelled(knowledgeId);

    let source: SourceReader;
    let diff: DiffResult;
    let targetCommit: string;
    let archiveSink: ArchiveSink | undefined;

    if (pullFactory !== undefined) {
      const factoryResult = await pullFactory({ knowledgeId, payload: msg.payload, currentCommit, branch });
      source = factoryResult.source;
      diff = factoryResult.diff;
      targetCommit = factoryResult.targetCommit;
      archiveSink = factoryResult.archiveSink;
      logger.info(`pull: pull factory wired (knowledgeId=${knowledgeId}, target=${targetCommit.slice(0, 12)})`);
      if (targetCommit === currentCommit) {
        logger.info(`pull: ${knowledgeId} already at ${targetCommit.slice(0, 12)}; no-op`);
        await transitionState(knowledgeId, KnowledgeState.Processed);
        return;
      }
    } else {
      await ensureReposRoot();
      const repoDir = repoCloneDir(knowledgeId);
      const cloneOpts: { repoUrl: string; branch: string; destinationDir: string; gitToken?: string } = {
        repoUrl,
        branch,
        destinationDir: repoDir,
      };
      if (gitToken !== undefined) {
        cloneOpts.gitToken = gitToken;
      }
      await syncRepository(cloneOpts);

      const branchHead = await readHeadCommitHash(repoDir);
      if (branchHead === "unknown") {
        throw new IngestError(knowledgeId, "could not resolve branch HEAD after clone");
      }
      targetCommit = msg.payload.targetCommitHash ?? branchHead;

      if (targetCommit === currentCommit) {
        logger.info(`pull: ${knowledgeId} already at ${targetCommit.slice(0, 12)}; no-op`);
        await transitionState(knowledgeId, KnowledgeState.Processed);
        return;
      }

      // Deepen the shallow clone first so historical commits selected via the
      // picker become visible to `merge-base --is-ancestor`. Without this the
      // assertion below rejects every non-HEAD pick on a `--depth=1` clone.
      await materialiseEndpoints(repoDir, branch, currentCommit, targetCommit);

      if (!(await assertReachableFromBranch(repoDir, targetCommit, branch))) {
        throw new IngestError(
          knowledgeId,
          `target commit ${targetCommit} is not reachable from origin/${branch}. Cross-branch pulls are not supported; create a fresh github_index job for the new branch.`,
        );
      }

      diff = await computePullDiff(repoDir, currentCommit, targetCommit);
      await checkoutCommit(repoDir, targetCommit);
      source = createDiskSourceReader({ repoDir, commitHash: targetCommit });
    }

    throwIfCancelled(knowledgeId);
    await snapshotFilesToVersion({ knowledgeId, commitHash: currentCommit }).catch((cause: unknown) => {
      const msgText = cause instanceof Error ? cause.message : String(cause);
      logger.warn(`pull: snapshot of ${currentCommit.slice(0, 12)} failed (non-fatal): ${msgText}`);
    });

    const metaPaths = metaPathsFor(knowledgeId);
    await ensureMetaDirs(metaPaths);

    const affectedFolders = affectedFoldersFromDiff(diff);

    const fileAnalyzer = createLlmFileAnalyzer({
      buildSystemPrompt: () => COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT,
      buildUserPrompt: buildFileAnalysisUserPrompt,
    });

    const llmCallContext = llmCallContextFromPayload(msg.payload);

    logger.info(`pull: phase per-file dispatcher for ${knowledgeId} starting`);
    throwIfCancelled(knowledgeId);
    const analyseChangedInput: Parameters<typeof analyseChangedFiles>[0] = {
      knowledgeId,
      source,
      metaPaths,
      analyzer: fileAnalyzer,
      diff,
    };
    if (llmCallContext !== undefined) {
      analyseChangedInput.llmCallContext = llmCallContext;
    }
    if (archiveSink !== undefined) {
      analyseChangedInput.archiveSink = archiveSink;
    }
    await analyseChangedFiles(analyseChangedInput);

    logger.info(`pull: phase process big files starting`);
    throwIfCancelled(knowledgeId);
    const processBigFilesInput: Parameters<typeof processBigFilesQueue>[0] = { knowledgeId, source, metaPaths };
    if (llmCallContext !== undefined) {
      processBigFilesInput.llmCallContext = llmCallContext;
    }
    await processBigFilesQueue(processBigFilesInput);

    logger.info(`pull: phase backfill fields starting`);
    throwIfCancelled(knowledgeId);
    await backfillMissingFields(metaPaths, llmCallContext);

    logger.info(`pull: phase backfill big-files starting`);
    throwIfCancelled(knowledgeId);
    const backfillBigFilesInput: Parameters<typeof backfillBigFiles>[0] = { knowledgeId, source, metaPaths };
    if (llmCallContext !== undefined) {
      backfillBigFilesInput.llmCallContext = llmCallContext;
    }
    await backfillBigFiles(backfillBigFilesInput);

    logger.info(`pull: phase selective folder summary (${affectedFolders.size} folders) starting`);
    throwIfCancelled(knowledgeId);
    const selectiveInput: Parameters<typeof runSelectiveFolderSummary>[0] = {
      knowledgeId,
      metaPaths,
      affectedFolders,
    };
    if (llmCallContext !== undefined) {
      selectiveInput.llmCallContext = llmCallContext;
    }
    await runSelectiveFolderSummary(selectiveInput);

    logger.info(`pull: phase repo summary starting`);
    throwIfCancelled(knowledgeId);
    const orgId = resolveOrgId({ ...(knowledge.source.kind === "github" ? {} : {}) });
    const scope: NodeScope = { orgId, knowledgeId, repoId: knowledgeId };
    const repoSummary = await summariseRepo(knowledgeId, metaPaths, llmCallContext);
    if (repoSummary !== null) {
      await persistRepoSummary(metaPaths, makeRepoSummaryEnvelope(knowledgeId, orgId, repoSummary));
    }

    logger.info(`pull: phase graph store starting`);
    throwIfCancelled(knowledgeId);
    const stored = await storePullAnalysis({
      scope,
      payload: { knowledgeId, repoUrl, branch },
      branch,
      metaPaths,
      diff,
      affectedFolders,
    });

    await persistPullStats({
      knowledgeId,
      repoName: repoNameFromUrl(repoUrl),
      commitHash: targetCommit,
      filesAnalyzed: stored.filesUpserted,
      foldersSummarised: stored.foldersUpserted,
      processingTimeMs: Date.now() - startedAt,
    });
    await setKnowledgeCommit(knowledgeId, targetCommit);
    await transitionState(knowledgeId, KnowledgeState.Processed);
    logger.info(
      `pull: ${knowledgeId} ${currentCommit.slice(0, 12)} -> ${targetCommit.slice(0, 12)} done (filesUpserted=${stored.filesUpserted} filesDeleted=${stored.filesDeleted} foldersUpserted=${stored.foldersUpserted})`,
    );
  } catch (cause: unknown) {
    if (cause instanceof CancellationError) {
      clearCancellation(knowledgeId);
      logger.info(`pull: cancelled for ${knowledgeId}`);
      throw cause;
    }
    await transitionState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    throw new IngestError(knowledgeId, `github_pull failed: ${describe(cause)}`, cause);
  }
}

async function transitionState(knowledgeId: string, state: KnowledgeState): Promise<void> {
  await setKnowledgeState(knowledgeId, state);
  await setKnowledgeStateInGraph(knowledgeId, state).catch(() => undefined);
}

interface PersistPullStatsInput {
  knowledgeId: string;
  repoName: string;
  commitHash: string;
  filesAnalyzed: number;
  foldersSummarised: number;
  processingTimeMs: number;
}

async function persistPullStats(input: PersistPullStatsInput): Promise<void> {
  const estimatedCost = await estimateCostFromBreakdown({});
  await recordProcessingStats({
    knowledgeId: input.knowledgeId,
    repoName: input.repoName,
    commitHash: input.commitHash,
    modelTokens: {},
    estimatedCost,
    totalBatches: 1,
    totalFiles: input.filesAnalyzed,
    totalFolders: input.foldersSummarised,
    filesAnalyzed: input.filesAnalyzed,
    processingTimeMs: input.processingTimeMs,
  });
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

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
