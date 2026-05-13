import path from "node:path";
import { readFile } from "node:fs/promises";
import { logger } from "@bb/logger";
import type { MetaPaths } from "src/types/meta-paths.ts";
import { throwIfCancelled, CancellationError } from "src/pipeline/cancellation.ts";
import { readBigFiles } from "src/strategies/flat-folder/big-file/detector.ts";
import { inspect } from "src/strategies/flat-folder/big-file/cache.ts";
import { processBigFile } from "src/strategies/flat-folder/big-file/index.ts";

export interface ProcessBigFilesInput {
  knowledgeId: string;
  repoDir: string;
  metaPaths: MetaPaths;
}

export interface ProcessBigFilesResult {
  processed: number;
  cached: number;
  failed: number;
  skippedOversized: number;
}

export async function processBigFilesQueue(input: ProcessBigFilesInput): Promise<ProcessBigFilesResult> {
  const entries = await readBigFiles(input.metaPaths);
  let processed = 0;
  let cached = 0;
  let failed = 0;
  let skippedOversized = 0;

  for (const entry of entries) {
    throwIfCancelled(input.knowledgeId);
    if (entry.reason === "too-large") {
      skippedOversized += 1;
      continue;
    }
    const status = await inspect(input.metaPaths, entry.relativePath);
    if (status === "complete") {
      cached += 1;
      continue;
    }
    const absolutePath = path.join(input.repoDir, entry.relativePath);
    let content: string;
    try {
      content = await readFile(absolutePath, "utf8");
    } catch (cause: unknown) {
      failed += 1;
      logger.warn(`phase2: read failed for ${entry.relativePath}: ${describe(cause)}`);
      continue;
    }
    try {
      await processBigFile({
        knowledgeId: input.knowledgeId,
        metaPaths: input.metaPaths,
        relativePath: entry.relativePath,
        content,
        sizeBytes: entry.sizeBytes,
      });
      processed += 1;
    } catch (cause: unknown) {
      if (cause instanceof CancellationError) {
        throw cause;
      }
      failed += 1;
      logger.warn(`phase2: processBigFile failed for ${entry.relativePath}: ${describe(cause)}`);
    }
  }
  logger.info(
    `phase2 done: processed=${processed} cached=${cached} failed=${failed} skippedOversized=${skippedOversized}`,
  );
  return { processed, cached, failed, skippedOversized };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
