import type { GithubIndexPayload, JobMessage, LocalIngestPayload } from "@bb/types";
import { IngestError } from "@bb/errors";
import { isEnvelopeCoherent, narrowGithubIngest, narrowLocalIngest } from "#src/payload/narrow.ts";
import type { IngestRunnerDeps } from "#src/types/ingest-runner.ts";

export interface IngestJobHandlerDeps {
  runner: IngestRunnerDeps;
}

export function createGithubIngestHandler(
  deps: IngestJobHandlerDeps,
): (msg: JobMessage<GithubIndexPayload>) => Promise<void> {
  return async function handleGithubIngest(msg: JobMessage<GithubIndexPayload>): Promise<void> {
    const payload = narrowGithubIngest(msg.knowledgeId, msg.payload);
    if (!isEnvelopeCoherent(msg.knowledgeId, payload.knowledgeId)) {
      throw new IngestError(
        msg.knowledgeId,
        `envelope mismatch: job.knowledgeId=${msg.knowledgeId} payload.knowledgeId=${payload.knowledgeId}`,
      );
    }
    await deps.runner.run({ job: msg, payload });
  };
}

export function createLocalIngestHandler(
  deps: IngestJobHandlerDeps,
): (msg: JobMessage<LocalIngestPayload>) => Promise<void> {
  return async function handleLocalIngest(msg: JobMessage<LocalIngestPayload>): Promise<void> {
    const payload = narrowLocalIngest(msg.knowledgeId, msg.payload);
    if (!isEnvelopeCoherent(msg.knowledgeId, payload.knowledgeId)) {
      throw new IngestError(
        msg.knowledgeId,
        `envelope mismatch: job.knowledgeId=${msg.knowledgeId} payload.knowledgeId=${payload.knowledgeId}`,
      );
    }
    await deps.runner.run({ job: msg, payload });
  };
}
