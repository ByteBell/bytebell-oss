import { logger } from "@bb/logger";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import type { AskLlmOptions } from "@bb/llm";
import type { MetaPaths } from "#src/types/meta-paths.ts";
import { withConcurrency } from "#src/pipeline/concurrency.ts";
import { throwIfCancelled, CancellationError } from "#src/pipeline/cancellation.ts";
import {
  groupByDirectFolder,
  persistFolderSummary,
  summariseFolder,
} from "#src/strategies/flat-folder/folder-summary.ts";

export interface SelectiveFolderSummaryInput {
  knowledgeId: string;
  metaPaths: MetaPaths;
  affectedFolders: Set<string>;
  llmCallContext?: AskLlmOptions;
}

export interface SelectiveFolderSummaryResult {
  succeeded: number;
  failed: number;
  skipped: number;
  tokenUsage: { inputTokens: number; outputTokens: number; costUsd: number };
}

/**
 * Pull-time folder summary. Same machinery as `runFolderSummaryPhase` but
 * only regenerates folders the caller flagged as affected. Reads condensed
 * file analyses from disk; the dispatcher must have populated them already.
 */
export async function runSelectiveFolderSummary(
  input: SelectiveFolderSummaryInput,
): Promise<SelectiveFolderSummaryResult> {
  const concurrentWorkers = getConfigValue(Config.ConcurrentWorkers);
  const limit = withConcurrency(concurrentWorkers);
  const groups = await groupByDirectFolder(input.metaPaths);
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  const tasks: Promise<void>[] = [];
  for (const [folderPath, files] of groups.entries()) {
    if (!input.affectedFolders.has(folderPath)) {
      skipped += 1;
      continue;
    }
    tasks.push(
      limit(async () => {
        try {
          throwIfCancelled(input.knowledgeId);
          const { summary, tokenUsage } = await summariseFolder(folderPath, files, input.llmCallContext);
          totalInputTokens += tokenUsage.inputTokens;
          totalOutputTokens += tokenUsage.outputTokens;
          totalCostUsd += tokenUsage.costUsd;
          if (summary !== null) {
            await persistFolderSummary(input.metaPaths, summary);
            succeeded += 1;
          } else {
            failed += 1;
          }
        } catch (cause: unknown) {
          if (cause instanceof CancellationError) {
            throw cause;
          }
          failed += 1;
          logger.warn(`pull-folder-summary: failed for ${folderPath || "<root>"}`);
        }
      }),
    );
  }
  await Promise.all(tasks);
  logger.info(`pull-folder-summary done: succeeded=${succeeded} failed=${failed} skipped=${skipped}`);
  return {
    succeeded,
    failed,
    skipped,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd },
  };
}
