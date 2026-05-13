import { JobType } from "@bb/types";
import { registerWorker } from "@bb/queue";
import { IngestError } from "@bb/errors";
import { logger } from "@bb/logger";
import { createPipelineRunner } from "./pipeline/run.ts";
import { reposRoot } from "./pipeline/paths.ts";
import { createGithubIngestHandler, createLocalIngestHandler } from "./handlers/ingest-job.ts";
import { createFlatFolderStrategy } from "./strategies/flat-folder/index.ts";
import { createLlmFileAnalyzer } from "./adapters/llm-file-analyzer.ts";
import {
  COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT,
  buildFileAnalysisUserPrompt,
} from "./strategies/flat-folder/prompts/file-analysis.ts";

function buildSharedRunner(): ReturnType<typeof createPipelineRunner> {
  const fileAnalyzer = createLlmFileAnalyzer({
    buildSystemPrompt: () => COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT,
    buildUserPrompt: buildFileAnalysisUserPrompt,
  });
  const strategy = createFlatFolderStrategy({ fileAnalyzer });
  return createPipelineRunner({ reposRootDir: reposRoot(), strategy });
}

export function registerGithubWorkers(): void {
  const runner = buildSharedRunner();
  registerWorker(JobType.GithubIndex, createGithubIngestHandler({ runner }));
  registerWorker(JobType.GithubPull, async (msg): Promise<void> => {
    logger.warn(`github_pull migrating to flat-folder — job ${msg.id} parked`);
    throw new IngestError(
      msg.knowledgeId,
      "github_pull is being migrated to the flat-folder strategy; please re-index for now",
    );
  });
}

export function registerLocalIngestWorker(): void {
  const runner = buildSharedRunner();
  registerWorker(JobType.LocalIngest, createLocalIngestHandler({ runner }));
}

export { createFlatFolderStrategy } from "./strategies/flat-folder/index.ts";
export { createLlmFileAnalyzer } from "./adapters/llm-file-analyzer.ts";
export type { IngestStrategy, StrategyInput, StrategyResult, StrategyContext } from "./types/strategy.ts";
export type { FileAnalyzer, AnalyzedFileResult } from "./types/pipeline.ts";
export type { CondensedFileAnalysis } from "./types/condensed-file-analysis.ts";
export { fetchLatestCommitHash, parseGithubRepo } from "./githubApi.ts";
export type { ParsedRepo } from "./githubApi.ts";
