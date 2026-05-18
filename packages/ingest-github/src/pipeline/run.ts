import { KnowledgeState, type GithubIndexPayload, type LocalIngestPayload } from "@bb/types";
import { setKnowledgeBranch, setKnowledgeCommit, setKnowledgeState } from "@bb/mongo";
import { setKnowledgeBranchInGraph, setKnowledgeStateInGraph } from "@bb/neo4j";
import { IngestError } from "@bb/errors";
import { logger } from "@bb/logger";
import type { IngestRunnerDeps, IngestRunnerInput } from "#src/types/ingest-runner.ts";
import type { IngestStrategy } from "#src/types/strategy.ts";
import type { ArchiveSink, PipelineSummary, SourceFactory, SourceReader } from "#src/types/pipeline.ts";
import type { ProgressContextFactory } from "#src/progress/types.ts";
import { nullProgressContextFactory } from "#src/progress/NullProgressReporter.ts";
import { ensureMetaDirs, ensureReposRoot, metaPathsFor, repoCloneDir } from "./paths.ts";
import { readHeadCommitHash, syncRepository } from "./source.ts";
import { resolveBranch } from "./branch.ts";
import { CancellationError, clearCancellation, throwIfCancelled } from "./cancellation.ts";
import { createDiskSourceReader } from "./disk-source-reader.ts";
import { resolveOrgId, llmCallContextFromPayload } from "./context.ts";
import { describe, persistStats, repoNameFromUrl, localRepoName } from "./stats.ts";

export interface CreatePipelineRunnerDeps {
  reposRootDir: string;
  strategy: IngestStrategy;
  /**
   * Optional source factory. When provided, GitHub-ingest skips the default
   * disk clone and uses the factory's returned reader instead. The factory is
   * documented in `docs/extension-points.md`; the open-source binary never
   * supplies one.
   */
  sourceFactory?: SourceFactory;
  /**
   * Optional progress context factory. When provided, the runner emits
   * pre-strategy phase changes (`clone`, `scan`) so SSE clients see liveness
   * during the network/disk-bound prelude. Defaults to a no-op.
   */
  progressContextFactory?: ProgressContextFactory;
}

export function createPipelineRunner(deps: CreatePipelineRunnerDeps): IngestRunnerDeps {
  const progressContextFactory = deps.progressContextFactory ?? nullProgressContextFactory;
  return {
    reposRootDir: deps.reposRootDir,
    strategy: deps.strategy,
    run: async (input: IngestRunnerInput): Promise<PipelineSummary> => {
      const payload = input.payload;
      if (isGithubPayload(payload)) {
        return await runGithub(deps.strategy, payload, deps.sourceFactory, progressContextFactory);
      }
      return await runLocal(deps.strategy, payload);
    },
  };
}

async function runGithub(
  strategy: IngestStrategy,
  payload: GithubIndexPayload,
  sourceFactory: SourceFactory | undefined,
  progressContextFactory: ProgressContextFactory,
): Promise<PipelineSummary> {
  const { knowledgeId } = payload;
  clearCancellation(knowledgeId);
  const startedAt = Date.now();
  await transitionState(knowledgeId, KnowledgeState.Processing);
  const progressContext = progressContextFactory(knowledgeId);
  let strategyStarted = false;
  try {
    throwIfCancelled(knowledgeId);
    const branch = await resolveBranch(knowledgeId, payload, payload.gitToken);
    await setKnowledgeBranch(knowledgeId, branch);
    await setKnowledgeBranchInGraph(knowledgeId, branch).catch(() => undefined);

    let source: SourceReader;
    let archiveSink: ArchiveSink | undefined;
    let commitHash: string;

    progressContext.phaseChanged("clone");
    if (sourceFactory !== undefined) {
      const factoryResult = await sourceFactory({ knowledgeId, payload, branch });
      source = factoryResult.source;
      commitHash = factoryResult.commitHash;
      archiveSink = factoryResult.archiveSink;
      logger.info(`pipeline/run: source factory wired (knowledgeId=${knowledgeId}, commit=${commitHash.slice(0, 12)})`);
    } else {
      await ensureReposRoot();
      const repoDir = repoCloneDir(knowledgeId);
      const cloneOpts: { repoUrl: string; branch: string; destinationDir: string; gitToken?: string } = {
        repoUrl: payload.repoUrl,
        branch,
        destinationDir: repoDir,
      };
      if (payload.gitToken !== undefined) {
        cloneOpts.gitToken = payload.gitToken;
      }
      await syncRepository(cloneOpts);
      commitHash = await readHeadCommitHash(repoDir);
      if (commitHash === "unknown") {
        throw new IngestError(knowledgeId, "could not resolve HEAD commit hash after clone");
      }
      source = createDiskSourceReader({ repoDir, commitHash });
    }

    progressContext.phaseChanged("scan");
    const metaPaths = metaPathsFor(knowledgeId);
    await ensureMetaDirs(metaPaths);

    const baseContext: Parameters<typeof strategy.execute>[0]["context"] = {
      knowledgeId,
      orgId: resolveOrgId(payload),
      repoId: knowledgeId,
    };
    const llmCallContext = llmCallContextFromPayload(payload);
    if (llmCallContext !== undefined) {
      baseContext.llmCallContext = llmCallContext;
    }
    const strategyInput: Parameters<typeof strategy.execute>[0] = {
      payload,
      branch,
      source,
      metaPaths,
      context: baseContext,
    };
    if (archiveSink !== undefined) {
      strategyInput.archiveSink = archiveSink;
    }
    strategyStarted = true;
    const result = await strategy.execute(strategyInput);

    const stats = await persistStats({
      knowledgeId,
      repoName: repoNameFromUrl(payload.repoUrl),
      commitHash,
      filesAnalyzed: result.filesAnalyzed,
      foldersSummarised: result.foldersSummarised,
      processingTimeMs: Date.now() - startedAt,
      tokenUsage: result.tokenUsage,
    });
    await setKnowledgeCommit(knowledgeId, commitHash, String(stats.inputTokens), String(stats.outputTokens));
    await transitionState(knowledgeId, KnowledgeState.Processed);

    const totalMs = Date.now() - startedAt;
    logger.info(
      `pipeline/run: ✓ github_index complete (knowledgeId=${knowledgeId}, commit=${commitHash.slice(0, 12)}, files=${result.filesAnalyzed}, folders=${result.foldersSummarised}, nodes=${result.graphNodesWritten}, ${totalMs}ms)`,
    );

    return {
      filesAnalyzed: result.filesAnalyzed,
      foldersSummarised: result.foldersSummarised,
      repoSummarised: result.repoSummarised,
      graphNodesWritten: result.graphNodesWritten,
      commitHash,
      tokenUsage: result.tokenUsage,
    };
  } catch (cause: unknown) {
    if (cause instanceof CancellationError) {
      clearCancellation(knowledgeId);
      logger.info(`pipeline/run: ingestion cancelled for ${knowledgeId}`);
      throw cause;
    }
    await transitionState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    if (!strategyStarted) {
      progressContext.failed(describe(cause));
    }
    throw new IngestError(knowledgeId, `github_index pipeline failed: ${describe(cause)}`, cause);
  }
}

async function runLocal(strategy: IngestStrategy, payload: LocalIngestPayload): Promise<PipelineSummary> {
  const { knowledgeId, rootDir } = payload;
  clearCancellation(knowledgeId);
  const startedAt = Date.now();
  await transitionState(knowledgeId, KnowledgeState.Processing);
  try {
    throwIfCancelled(knowledgeId);
    const metaPaths = metaPathsFor(knowledgeId);
    await ensureMetaDirs(metaPaths);

    const source = createDiskSourceReader({ repoDir: rootDir, commitHash: `local-${startedAt}` });

    const result = await strategy.execute({
      payload: { knowledgeId, repoUrl: `local:${rootDir}` },
      branch: "local",
      source,
      metaPaths,
      context: { knowledgeId, orgId: resolveOrgId(payload), repoId: knowledgeId },
    });

    const commitHash = `local-${startedAt}`;
    await persistStats({
      knowledgeId,
      repoName: localRepoName(rootDir),
      commitHash,
      filesAnalyzed: result.filesAnalyzed,
      foldersSummarised: result.foldersSummarised,
      processingTimeMs: Date.now() - startedAt,
      tokenUsage: result.tokenUsage,
    });
    await transitionState(knowledgeId, KnowledgeState.Processed);
    return {
      filesAnalyzed: result.filesAnalyzed,
      foldersSummarised: result.foldersSummarised,
      repoSummarised: result.repoSummarised,
      graphNodesWritten: result.graphNodesWritten,
      commitHash,
      tokenUsage: result.tokenUsage,
    };
  } catch (cause: unknown) {
    if (cause instanceof CancellationError) {
      clearCancellation(knowledgeId);
      throw cause;
    }
    await transitionState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    throw new IngestError(knowledgeId, `local_ingest pipeline failed: ${describe(cause)}`, cause);
  }
}

async function transitionState(knowledgeId: string, state: KnowledgeState): Promise<void> {
  await setKnowledgeState(knowledgeId, state);
  await setKnowledgeStateInGraph(knowledgeId, state).catch(() => undefined);
}

function isGithubPayload(payload: GithubIndexPayload | LocalIngestPayload): payload is GithubIndexPayload {
  return (payload as GithubIndexPayload).repoUrl !== undefined;
}
