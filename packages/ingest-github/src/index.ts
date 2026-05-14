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

/**
 * Optional dependencies for the GitHub workers. Both factories are
 * documented in `docs/extension-points.md`. The open-source binary
 * leaves both undefined — index and pull use the default disk-backed
 * readers and a local `git clone` / `git diff`.
 */
export interface RegisterGithubWorkersDeps {
  sourceFactory?: SourceFactory;
  pullFactory?: PullFactory;
}

function buildRunner(sourceFactory: SourceFactory | undefined): ReturnType<typeof createPipelineRunner> {
  const fileAnalyzer = createLlmFileAnalyzer({
    buildSystemPrompt: () => COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT,
    buildUserPrompt: buildFileAnalysisUserPrompt,
  });
  const strategy = createFlatFolderStrategy({ fileAnalyzer });
  const runnerDeps: Parameters<typeof createPipelineRunner>[0] = { reposRootDir: reposRoot(), strategy };
  if (sourceFactory !== undefined) {
    runnerDeps.sourceFactory = sourceFactory;
  }
  return createPipelineRunner(runnerDeps);
}

export function registerGithubWorkers(deps: RegisterGithubWorkersDeps = {}): void {
  const runner = buildRunner(deps.sourceFactory);
  registerWorker(JobType.GithubIndex, createGithubIngestHandler({ runner }));
  const pullFactory = deps.pullFactory;
  registerWorker(JobType.GithubPull, (msg) => runPull(msg, pullFactory));
}

export function registerLocalIngestWorker(): void {
  const runner = buildRunner(undefined);
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
export { fetchLatestCommitHash, fetchRecentCommits, parseGithubRepo } from "./githubApi.ts";
export type { CommitEntry, FetchCommitsResult, ParsedRepo } from "./githubApi.ts";
export { bootstrapRuntime } from "./bootstrap.ts";
export type { BootstrapRuntimeOptions } from "./bootstrap.ts";
export {
  COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT,
  buildFileAnalysisUserPrompt,
} from "./strategies/flat-folder/prompts/file-analysis.ts";
