import type { Worker } from "bullmq";
import { Queue } from "bullmq";
import { JobType } from "@bb/types";
import { QueueConnectError, QueueNotConnectedError } from "@bb/errors";
import { getRedisConnection } from "@bb/redis";

export const QUEUE_PREFIX = "bb";

const ALL_JOB_TYPES: readonly JobType[] = [JobType.GithubIndex, JobType.GithubPull, JobType.LocalIngest];

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: true,
  removeOnFail: false,
  attempts: 3,
  backoff: { type: "fixed", delay: 5000 },
} as const;

const queues = new Map<JobType, Queue>();
const workers: Worker[] = [];
let connecting: Promise<void> | null = null;

export async function connectQueue(): Promise<void> {
  if (queues.size > 0) {
    return;
  }
  if (connecting !== null) {
    return connecting;
  }
  connecting = doConnect().finally(() => {
    connecting = null;
  });
  return connecting;
}

async function doConnect(): Promise<void> {
  try {
    const connection = getRedisConnection();
    for (const type of ALL_JOB_TYPES) {
      const queue = new Queue(type, {
        connection,
        prefix: QUEUE_PREFIX,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      queues.set(type, queue);
    }
  } catch (cause: unknown) {
    queues.clear();
    throw cause instanceof QueueConnectError ? cause : new QueueConnectError(cause);
  }
}

export async function closeQueue(): Promise<void> {
  const ws = workers.splice(0);
  await Promise.all(ws.map((w) => w.close()));
  const qs = Array.from(queues.values());
  queues.clear();
  await Promise.all(qs.map((q) => q.close()));
}

export function _getQueue(type: JobType): Queue {
  const q = queues.get(type);
  if (q === undefined) {
    throw new QueueNotConnectedError();
  }
  return q;
}

export function _registerWorker(worker: Worker): void {
  workers.push(worker);
}

export function _isConnected(): boolean {
  return queues.size > 0;
}

export function __resetForTests(): void {
  queues.clear();
  workers.splice(0);
  connecting = null;
}
