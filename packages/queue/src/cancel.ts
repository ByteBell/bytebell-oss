import { JobType } from "@bb/types";
import { _getQueue } from "./manager.ts";
import { dedupeKey } from "./envelope.ts";

const CANCELABLE_TYPES: readonly JobType[] = [JobType.GithubIndex, JobType.GithubPull, JobType.LocalIngest];

export interface RemoveKnowledgeJobsResult {
  removed: number;
}

export async function removeKnowledgeJobs(knowledgeId: string): Promise<RemoveKnowledgeJobsResult> {
  let removed = 0;
  for (const type of CANCELABLE_TYPES) {
    const queue = _getQueue(type);
    const jobId = dedupeKey(type, knowledgeId);
    const job = await queue.getJob(jobId);
    if (job === undefined || job === null) {
      continue;
    }
    try {
      await job.remove();
      removed += 1;
    } catch {
      // active jobs cannot be removed; leave them to finish naturally
    }
  }
  return { removed };
}
