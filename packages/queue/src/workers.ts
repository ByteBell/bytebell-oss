import { Worker, type Job } from "bullmq";
import { Config, JobType, type JobMessage, type PayloadFor } from "@bb/types";
import { getConfigValue } from "@bb/config";
import { getRedisConnection } from "@bb/redis";
import { _isConnected, _registerWorker, QUEUE_PREFIX } from "./manager.ts";
import { QueueNotConnectedError } from "@bb/errors";

export interface WorkerRegistrationOptions {
  concurrency?: number;
}

export type JobHandler<T extends JobType> = (msg: JobMessage<PayloadFor<T>>) => Promise<void>;

export function registerWorker<T extends JobType>(
  type: T,
  handler: JobHandler<T>,
  opts: WorkerRegistrationOptions = {},
): Worker {
  if (!_isConnected()) {
    throw new QueueNotConnectedError();
  }
  const concurrency = opts.concurrency ?? defaultConcurrencyFor(type);
  const worker = new Worker(
    type,
    async (job: Job<JobMessage<PayloadFor<T>>>) => {
      await handler(job.data);
    },
    {
      connection: getRedisConnection(),
      prefix: QUEUE_PREFIX,
      concurrency,
    },
  );
  _registerWorker(worker);
  return worker;
}

function defaultConcurrencyFor(type: JobType): number {
  switch (type) {
    case JobType.GithubIndex:
    case JobType.GithubPull:
    case JobType.LocalIngest:
    case JobType.BusinessContextProcessing:
      return getConfigValue(Config.ConcurrencyGithub);
  }
}
