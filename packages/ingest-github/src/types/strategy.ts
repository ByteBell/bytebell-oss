import type { GithubIndexPayload } from "@bb/types";
import type { AskLlmOptions } from "@bb/llm";
import type { MetaPaths } from "./meta-paths.ts";
import type { ArchiveSink, SourceReader } from "./pipeline.ts";

export interface StrategyContext {
  knowledgeId: string;
  orgId: string;
  repoId: string;
  /**
   * Per-job LLM credential overrides extracted from the job payload. When
   * present, phases pass these to every `askLLM` / `askJsonLLM` call so the
   * per-org credential reaches the LLM provider. Absent in OSS standalone
   * runs, where calls fall back to `Config.OpenrouterApiKey`.
   */
  llmCallContext?: AskLlmOptions;
}

export interface StrategyInput {
  payload: GithubIndexPayload;
  branch: string;
  source: SourceReader;
  archiveSink?: ArchiveSink;
  metaPaths: MetaPaths;
  context: StrategyContext;
}

export interface StrategyResult {
  filesAnalyzed: number;
  foldersSummarised: number;
  repoSummarised: boolean;
  graphNodesWritten: number;
  tokenUsage: { inputTokens: number; outputTokens: number; costUsd: number };
}

export interface IngestStrategy {
  readonly name: string;
  execute(input: StrategyInput): Promise<StrategyResult>;
}
