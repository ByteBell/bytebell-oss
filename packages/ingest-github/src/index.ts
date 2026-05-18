import { JobType } from "@bb/types";
import { registerWorker } from "@bb/queue";
import { createPipelineRunner } from "./pipeline/run.ts";
import { reposRoot } from "./pipeline/paths.ts";
import { runPull } from "./pipeline/pull.ts";
import { createGithubIngestHandler, createLocalIngestHandler } from "./handlers/ingest-job.ts";
import { createFlatFolderStrategy } from "./strategies/flat-folder/index.ts";
import { createLlmFileAnalyzer } from "./adapters/llm-file-analyzer.ts";
import {
  COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT,
  buildFileAnalysisUserPrompt,
} from "./strategies/flat-folder/prompts/file-analysis.ts";
import type { PullFactory, SourceFactory } from "./types/pipeline.ts";
import type { ProgressContextFactory } from "./progress/types.ts";
import { nullProgressContextFactory } from "./progress/NullProgressReporter.ts";

/**
 * Optional dependencies for the GitHub workers. Factories are documented in
 * `docs/extension-points.md`. The open-source binary leaves them undefined —
 * index and pull use the default disk-backed readers, and progress events
 * are discarded by `nullProgressContextFactory`.
 */
export interface RegisterGithubWorkersDeps {
  sourceFactory?: SourceFactory;
  pullFactory?: PullFactory;
  progressContextFactory?: ProgressContextFactory;
}

function buildRunner(
  sourceFactory: SourceFactory | undefined,
  progressContextFactory: ProgressContextFactory,
): ReturnType<typeof createPipelineRunner> {
  const fileAnalyzer = createLlmFileAnalyzer({
    buildSystemPrompt: () => COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT,
    buildUserPrompt: buildFileAnalysisUserPrompt,
  });
  const strategy = createFlatFolderStrategy({ fileAnalyzer, progressContextFactory });
  const runnerDeps: Parameters<typeof createPipelineRunner>[0] = {
    reposRootDir: reposRoot(),
    strategy,
    progressContextFactory,
  };
  if (sourceFactory !== undefined) {
    runnerDeps.sourceFactory = sourceFactory;
  }
  return createPipelineRunner(runnerDeps);
}

export function registerGithubWorkers(deps: RegisterGithubWorkersDeps = {}): void {
  const progressContextFactory = deps.progressContextFactory ?? nullProgressContextFactory;
  const runner = buildRunner(deps.sourceFactory, progressContextFactory);
  registerWorker(JobType.GithubIndex, createGithubIngestHandler({ runner }));
  const pullFactory = deps.pullFactory;
  registerWorker(JobType.GithubPull, (msg) => runPull(msg, pullFactory, progressContextFactory));
}

export function registerLocalIngestWorker(): void {
  const runner = buildRunner(undefined, nullProgressContextFactory);
  registerWorker(JobType.LocalIngest, createLocalIngestHandler({ runner }));
}

export { createFlatFolderStrategy } from "./strategies/flat-folder/index.ts";
export { createLlmFileAnalyzer } from "./adapters/llm-file-analyzer.ts";
export { createDiskSourceReader } from "./pipeline/disk-source-reader.ts";
export { createPipelineRunner } from "./pipeline/run.ts";
export type { CreatePipelineRunnerDeps } from "./pipeline/run.ts";
export { createGithubIngestHandler, createLocalIngestHandler } from "./handlers/ingest-job.ts";
export type { IngestJobHandlerDeps } from "./handlers/ingest-job.ts";
export { runPull } from "./pipeline/pull.ts";
export { reposRoot } from "./pipeline/paths.ts";
export type { IngestRunnerDeps, IngestRunnerInput } from "./types/ingest-runner.ts";
export type { IngestStrategy, StrategyInput, StrategyResult, StrategyContext } from "./types/strategy.ts";
export type {
  FileAnalyzer,
  AnalyzedFileResult,
  ScanEntry,
  ScannedFile,
  OversizedFile,
  ScanDeps,
  SourceReader,
  ArchiveSink,
  ArchiveSinkInput,
  SourceFactory,
  SourceFactoryInput,
  SourceFactoryResult,
  PullFactory,
  PullFactoryInput,
  PullFactoryResult,
} from "./types/pipeline.ts";
export type { DiffResult, RenamedFile } from "./pipeline/git-diff.ts";
export type { CondensedFileAnalysis } from "./types/condensed-file-analysis.ts";
export {
  fetchLatestCommitHash,
  fetchRecentCommits,
  fetchDefaultBranch,
  fetchBranches,
  parseGithubRepo,
} from "./githubApi.ts";
export type { CommitEntry, FetchCommitsResult, ParsedRepo, DefaultBranchResult } from "./githubApi.ts";
export { bootstrapRuntime } from "./bootstrap.ts";
export type { BootstrapRuntimeOptions } from "./bootstrap.ts";
export {
  COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT,
  buildFileAnalysisUserPrompt,
} from "./strategies/flat-folder/prompts/file-analysis.ts";
export type {
  ProgressContext,
  ProgressContextFactory,
  ProgressPhase,
  ProgressReporter,
  ProgressReporterInput,
  ProgressTotalMode,
} from "./progress/types.ts";
export { nullProgressContextFactory } from "./progress/NullProgressReporter.ts";
