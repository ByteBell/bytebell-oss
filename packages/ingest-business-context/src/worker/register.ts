import { JobType } from "@bb/types";
import { registerWorker, type WorkerRegistrationOptions } from "@bb/queue";
import { handleBusinessContextProcessing } from "#src/worker/handler.ts";

/**
 * Registers the BusinessContext worker against `JobType.BusinessContextProcessing`.
 * Called once by the deployable at boot. The default concurrency is sourced
 * from `Config.ConcurrencyGithub` (shared with other CPU/LLM-heavy workers);
 * callers may override via `opts.concurrency`.
 */
export function registerBusinessContextWorker(opts: WorkerRegistrationOptions = {}): void {
  registerWorker(JobType.BusinessContextProcessing, handleBusinessContextProcessing, opts);
}
