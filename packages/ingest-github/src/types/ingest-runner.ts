import type { GithubIndexPayload, JobMessage, LocalIngestPayload } from "@bb/types";
import type { IngestStrategy } from "./strategy.ts";
import type { PipelineSummary } from "./pipeline.ts";

export interface IngestRunnerInput {
  job: JobMessage<GithubIndexPayload> | JobMessage<LocalIngestPayload>;
  payload: GithubIndexPayload | LocalIngestPayload;
}

export interface IngestRunnerDeps {
  reposRootDir: string;
  strategy: IngestStrategy;
  run(input: IngestRunnerInput): Promise<PipelineSummary>;
}
