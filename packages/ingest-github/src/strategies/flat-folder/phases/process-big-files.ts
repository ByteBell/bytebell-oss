import { logger } from "@bb/logger";
import type { AskLlmOptions } from "@bb/llm";
import { LlmConfigError, LlmError } from "@bb/errors";
import type { MetaPaths } from "#src/types/meta-paths.ts";
import type { SourceReader } from "#src/types/pipeline.ts";
import type { ProgressContext } from "#src/progress/types.ts";
import { throwIfCancelled, CancellationError } from "#src/pipeline/cancellation.ts";
import { readBigFiles } from "#src/strategies/flat-folder/big-file/detector.ts";
import { inspect } from "#src/strategies/flat-folder/big-file/cache.ts";
import { processBigFile } from "#src/strategies/flat-folder/big-file/index.ts";

export interface ProcessBigFilesInput {
  knowledgeId: string;
  source: SourceReader;
  metaPaths: MetaPaths;
  llmCallContext?: AskLlmOptions;
  progressContext?: ProgressContext;
}

export interface ProcessBigFilesResult {
  processed: number;
  cached: number;
  failed: number;
  skippedOversized: number;
  tokenUsage: { inputTokens: number; outputTokens: number; costUsd: number };
}

export async function processBigFilesQueue(input: ProcessBigFilesInput): Promise<ProcessBigFilesResult> {
  const entries = await readBigFiles(input.metaPaths);
  let processed = 0;
  let cached = 0;
  let failed = 0;
  let skippedOversized = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  const reporter = input.progressContext?.reporter({
    phase: "file_analysis",
    subPhase: "big_files_queue",
    total: { kind: "fixed", total: entries.length },
  });
  await reporter?.start();

  try {
    for (const entry of entries) {
      throwIfCancelled(input.knowledgeId);
      if (entry.reason === "too-large") {
        skippedOversized += 1;
        reporter?.increment(1, { fileName: entry.relativePath });
        continue;
      }
      const status = await inspect(input.metaPaths, entry.relativePath);
      if (status === "complete") {
        cached += 1;
        reporter?.increment(1, { fileName: entry.relativePath });
        continue;
      }
      let content: string;
      try {
        content = await input.source.readFile(entry.relativePath);
      } catch (cause: unknown) {
        failed += 1;
        logger.warn(`phase2: read failed for ${entry.relativePath}: ${describe(cause)}`);
        reporter?.increment(1, { fileName: entry.relativePath });
        continue;
      }
      if (content.length === 0) {
        failed += 1;
        logger.warn(`phase2: empty content for ${entry.relativePath}; skipping`);
        reporter?.increment(1, { fileName: entry.relativePath });
        continue;
      }
      try {
        const condensed = await processBigFile({
          knowledgeId: input.knowledgeId,
          metaPaths: input.metaPaths,
          relativePath: entry.relativePath,
          content,
          sizeBytes: entry.sizeBytes,
          ...(input.llmCallContext !== undefined ? { llmCallContext: input.llmCallContext } : {}),
          ...(input.progressContext !== undefined ? { progressContext: input.progressContext } : {}),
        });
        processed += 1;
        if (condensed.tokenUsage) {
          totalInputTokens += condensed.tokenUsage.inputTokens;
          totalOutputTokens += condensed.tokenUsage.outputTokens;
          totalCostUsd += condensed.tokenUsage.costUsd;
        }
      } catch (cause: unknown) {
        if (cause instanceof CancellationError) {
          throw cause;
        }
        if (cause instanceof LlmConfigError || cause instanceof LlmError) {
          throw cause;
        }
        failed += 1;
        logger.warn(`phase2: processBigFile failed for ${entry.relativePath}: ${describe(cause)}`);
      }
      reporter?.increment(1, { fileName: entry.relativePath });
    }
    logger.info(
      `phase2 done: processed=${processed} cached=${cached} failed=${failed} skippedOversized=${skippedOversized}`,
    );
    return {
      processed,
      cached,
      failed,
      skippedOversized,
      tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd },
    };
  } finally {
    reporter?.stop();
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
