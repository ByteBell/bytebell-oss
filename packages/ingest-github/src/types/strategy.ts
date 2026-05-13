import type { GithubIndexPayload } from "@bb/types";
import type { MetaPaths } from "./meta-paths.ts";

export interface StrategyContext {
  knowledgeId: string;
  orgId: string;
  repoId: string;
}

export interface StrategyInput {
  payload: GithubIndexPayload;
  branch: string;
  repoDir: string;
  metaPaths: MetaPaths;
  context: StrategyContext;
}

export interface StrategyResult {
  filesAnalyzed: number;
  foldersSummarised: number;
  repoSummarised: boolean;
  graphNodesWritten: number;
}

export interface IngestStrategy {
  readonly name: string;
  execute(input: StrategyInput): Promise<StrategyResult>;
}
