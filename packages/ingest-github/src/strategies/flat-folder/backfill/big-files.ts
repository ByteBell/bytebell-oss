import { logger } from "@bb/logger";
import type { AskLlmOptions } from "@bb/llm";
import { LlmConfigError, LlmError } from "@bb/errors";
import type { MetaPaths } from "#src/types/meta-paths.ts";
import type { SourceReader } from "#src/types/pipeline.ts";
import type { ProgressContext } from "#src/progress/types.ts";
import { readBigFiles } from "#src/strategies/flat-folder/big-file/detector.ts";
import { inspect } from "#src/strategies/flat-folder/big-file/cache.ts";
import { processBigFile } from "#src/strategies/flat-folder/big-file/index.ts";

export interface BackfillBigFilesInput {
  knowledgeId: string;
  source: SourceReader;
  metaPaths: MetaPaths;
  llmCallContext?: AskLlmOptions;
  progressContext?: ProgressContext;
}

export interface BackfillBigFilesResult {
  reCondensed: number;
  failed: number;
}

export async function backfillBigFiles(input: BackfillBigFilesInput): Promise<BackfillBigFilesResult> {
  const entries = await readBigFiles(input.metaPaths);
  let reCondensed = 0;
  let failed = 0;
  const reporter = input.progressContext?.reporter({
    phase: "file_analysis",
    subPhase: "backfill:big_files",
    total: { kind: "fixed", total: entries.length },
  });
  await reporter?.start();
  try {
    for (const entry of entries) {
      if (entry.reason === "too-large") {
        reporter?.increment(1, { fileName: entry.relativePath });
        continue;
      }
      const status = await inspect(input.metaPaths, entry.relativePath);
      if (status === "complete") {
        reporter?.increment(1, { fileName: entry.relativePath });
        continue;
      }
      try {
        const content = await input.source.readFile(entry.relativePath);
        if (content.length === 0) {
          failed += 1;
          logger.warn(`phase4: empty content for ${entry.relativePath}; skipping`);
          reporter?.increment(1, { fileName: entry.relativePath });
          continue;
        }
        await processBigFile({
          knowledgeId: input.knowledgeId,
          metaPaths: input.metaPaths,
          relativePath: entry.relativePath,
          content,
          sizeBytes: entry.sizeBytes,
          ...(input.llmCallContext !== undefined ? { llmCallContext: input.llmCallContext } : {}),
          ...(input.progressContext !== undefined ? { progressContext: input.progressContext } : {}),
        });
        reCondensed += 1;
      } catch (cause: unknown) {
        if (cause instanceof LlmConfigError || cause instanceof LlmError) {
          throw cause;
        }
        failed += 1;
        const msg = cause instanceof Error ? cause.message : String(cause);
        logger.warn(`phase4: re-condense failed for ${entry.relativePath}: ${msg}`);
      }
      reporter?.increment(1, { fileName: entry.relativePath });
    }
    logger.info(`phase4 done: reCondensed=${reCondensed} failed=${failed}`);
    return { reCondensed, failed };
  } finally {
    reporter?.stop();
  }
}
