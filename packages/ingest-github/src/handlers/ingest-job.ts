import type { GithubIndexPayload, JobMessage, LocalIngestPayload } from "@bb/types";
import { IngestError } from "@bb/errors";
import { isEnvelopeCoherent, narrowGithubIngest, narrowLocalIngest } from "#src/payload/narrow.ts";
import type { IngestRunnerDeps } from "#src/types/ingest-runner.ts";
import type { PipelineSummary } from "#src/types/pipeline.ts";

export interface IngestJobHandlerDeps {
  runner: IngestRunnerDeps;
}

export function createGithubIngestHandler(
  deps: IngestJobHandlerDeps,
): (msg: JobMessage<GithubIndexPayload>) => Promise<PipelineSummary> {
  return async function handleGithubIngest(msg: JobMessage<GithubIndexPayload>): Promise<PipelineSummary> {
    const payload = narrowGithubIngest(msg.knowledgeId, msg.payload);
    if (!isEnvelopeCoherent(msg.knowledgeId, payload.knowledgeId)) {
      throw new IngestError(
        msg.knowledgeId,
        `envelope mismatch: job.knowledgeId=${msg.knowledgeId} payload.knowledgeId=${payload.knowledgeId}`,
      );
    }
    return await deps.runner.run({ job: msg, payload });
  };
}

export function createLocalIngestHandler(
  deps: IngestJobHandlerDeps,
): (msg: JobMessage<LocalIngestPayload>) => Promise<PipelineSummary> {
  return async function handleLocalIngest(msg: JobMessage<LocalIngestPayload>): Promise<PipelineSummary> {
    const payload = narrowLocalIngest(msg.knowledgeId, msg.payload);
    if (!isEnvelopeCoherent(msg.knowledgeId, payload.knowledgeId)) {
      throw new IngestError(
        msg.knowledgeId,
        `envelope mismatch: job.knowledgeId=${msg.knowledgeId} payload.knowledgeId=${payload.knowledgeId}`,
      );
    }
    return await deps.runner.run({ job: msg, payload });
  };
}
