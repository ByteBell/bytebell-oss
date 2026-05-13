import { logger } from "@bb/logger";
import type { MetaPaths } from "src/types/meta-paths.ts";
import type { SourceReader } from "src/types/pipeline.ts";
import { readBigFiles } from "src/strategies/flat-folder/big-file/detector.ts";
import { inspect } from "src/strategies/flat-folder/big-file/cache.ts";
import { processBigFile } from "src/strategies/flat-folder/big-file/index.ts";

export interface BackfillBigFilesInput {
  knowledgeId: string;
  source: SourceReader;
  metaPaths: MetaPaths;
}

export interface BackfillBigFilesResult {
  reCondensed: number;
  failed: number;
}

export async function backfillBigFiles(input: BackfillBigFilesInput): Promise<BackfillBigFilesResult> {
  const entries = await readBigFiles(input.metaPaths);
  let reCondensed = 0;
  let failed = 0;
  for (const entry of entries) {
    if (entry.reason === "too-large") {
      continue;
    }
    const status = await inspect(input.metaPaths, entry.relativePath);
    if (status === "complete") {
      continue;
    }
    try {
      const content = await input.source.readFile(entry.relativePath);
      if (content.length === 0) {
        failed += 1;
        logger.warn(`phase4: empty content for ${entry.relativePath}; skipping`);
        continue;
      }
      await processBigFile({
        knowledgeId: input.knowledgeId,
        metaPaths: input.metaPaths,
        relativePath: entry.relativePath,
        content,
        sizeBytes: entry.sizeBytes,
      });
      reCondensed += 1;
    } catch (cause: unknown) {
      failed += 1;
      const msg = cause instanceof Error ? cause.message : String(cause);
      logger.warn(`phase4: re-condense failed for ${entry.relativePath}: ${msg}`);
    }
  }
  logger.info(`phase4 done: reCondensed=${reCondensed} failed=${failed}`);
  return { reCondensed, failed };
}
