import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { tokenLen } from "@bb/llm";
import { logger } from "@bb/logger";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import type { FileAnalyzer, ScannedFile } from "src/types/pipeline.ts";
import type { MetaPaths } from "src/types/meta-paths.ts";
import type { BigFileEntry } from "src/types/big-file.ts";
import { looksBinary, passesPathFilters } from "src/pipeline/filters.ts";
import { withConcurrency } from "src/pipeline/concurrency.ts";
import { throwIfCancelled, CancellationError } from "src/pipeline/cancellation.ts";
import type { DiffResult } from "src/pipeline/git-diff.ts";
import { analyseScannedFile, buildOversizedStub } from "src/strategies/flat-folder/analyse-file.ts";
import { saveCondensed } from "src/strategies/flat-folder/big-file/storage.ts";
import { readBigFiles, writeBigFiles } from "src/strategies/flat-folder/big-file/detector.ts";

export interface AnalyseChangedInput {
  knowledgeId: string;
  repoDir: string;
  metaPaths: MetaPaths;
  analyzer: FileAnalyzer;
  diff: DiffResult;
  /**
   * Invoked once per consumed path (analysed, stubbed, queued-as-big-file,
   * filtered, or failed). Lets the caller drive a `processedFiles` counter
   * for the progress bar without coupling this strategy to mongo. Best
   * effort — errors from the callback are swallowed.
   */
  onFileProcessed?: () => Promise<void> | void;
}

export interface AnalyseChangedResult {
  smallFilesAnalysed: number;
  bigFilesQueued: number;
  oversizedStubs: number;
  skipped: number;
  failed: number;
}

/**
 * Pull-time per-file dispatcher. Iterates the changed file set from the git
 * diff and runs the same per-file work as `classifyAndAnalyseSmall`, but
 * targeted at known paths rather than a tree walk.
 *
 * For added / modified / renamed-to paths: read content, apply static path
 * filters, classify by tokens. Small files run the analyser inline and
 * persist a `CondensedFileAnalysis`. Files above the context window join
 * `bigFiles.json` for the big-file phase. Files above the absolute size cap
 * get an oversized stub.
 *
 * The dispatcher does NOT invoke the skip-decision LLM gate. Pulls re-analyse
 * paths that already passed the gate during the initial index (or paths so
 * new the gate has not seen them yet — for v1 we accept that lag).
 */
export async function analyseChangedFiles(input: AnalyseChangedInput): Promise<AnalyseChangedResult> {
  const contextWindowLimit = getConfigValue(Config.ContextWindowLimit);
  const absoluteCap = getConfigValue(Config.AbsoluteFileSizeCap);
  const bigFileLineThreshold = getConfigValue(Config.BigFileLineThreshold);
  const concurrentWorkers = getConfigValue(Config.ConcurrentWorkers);
  const limit = withConcurrency(concurrentWorkers);

  const newPaths: string[] = [...input.diff.added, ...input.diff.modified, ...input.diff.renamed.map((r) => r.newPath)];
  const seen = new Set<string>();
  const dedupedPaths = newPaths.filter((p) => {
    if (seen.has(p)) {
      return false;
    }
    seen.add(p);
    return true;
  });

  const bigFileBuffer: BigFileEntry[] = [];
  let smallFilesAnalysed = 0;
  let oversizedStubs = 0;
  let skipped = 0;
  let failed = 0;

  const pending: Promise<void>[] = [];

  for (const relativePath of dedupedPaths) {
    throwIfCancelled(input.knowledgeId);
    const filename = path.basename(relativePath);
    const ext = path.extname(filename).toLowerCase();
    if (!passesPathFilters(filename, ext)) {
      skipped += 1;
      continue;
    }

    const abs = path.join(input.repoDir, relativePath);
    let sizeBytes: number;
    try {
      sizeBytes = (await stat(abs)).size;
    } catch (cause: unknown) {
      failed += 1;
      logger.warn(`pull-analyse: stat failed for ${relativePath}: ${describe(cause)}`);
      continue;
    }

    if (sizeBytes > absoluteCap) {
      bigFileBuffer.push({
        relativePath,
        sizeBytes,
        tokenCount: 0,
        reason: "too-large",
      });
      try {
        await saveCondensed(input.metaPaths, buildOversizedStub(relativePath, sizeBytes));
        oversizedStubs += 1;
      } catch (cause: unknown) {
        failed += 1;
        logger.warn(`pull-analyse: oversized stub write failed for ${relativePath}: ${describe(cause)}`);
      }
      continue;
    }

    let buf: Buffer;
    try {
      buf = await readFile(abs);
    } catch (cause: unknown) {
      failed += 1;
      logger.warn(`pull-analyse: read failed for ${relativePath}: ${describe(cause)}`);
      continue;
    }
    if (looksBinary(buf)) {
      skipped += 1;
      continue;
    }
    const content = buf.toString("utf8");
    if (countLines(content) > bigFileLineThreshold) {
      bigFileBuffer.push({
        relativePath,
        sizeBytes,
        tokenCount: 0,
        reason: "too-large",
      });
      try {
        await saveCondensed(input.metaPaths, buildOversizedStub(relativePath, sizeBytes));
        oversizedStubs += 1;
      } catch (cause: unknown) {
        failed += 1;
        logger.warn(`pull-analyse: oversized stub write failed for ${relativePath}: ${describe(cause)}`);
      }
      continue;
    }

    const tokenCount = tokenLen(content);
    if (tokenCount > contextWindowLimit) {
      bigFileBuffer.push({
        relativePath,
        sizeBytes,
        tokenCount,
        reason: "context-window-exceeded",
      });
      continue;
    }

    const scanned: ScannedFile = {
      kind: "file",
      relativePath,
      absolutePath: abs,
      sizeBytes,
      content,
    };
    pending.push(
      limit(async () => {
        try {
          throwIfCancelled(input.knowledgeId);
          const condensed = await analyseScannedFile(input.analyzer, scanned);
          await saveCondensed(input.metaPaths, condensed);
          smallFilesAnalysed += 1;
        } catch (cause: unknown) {
          if (cause instanceof CancellationError) {
            throw cause;
          }
          failed += 1;
          logger.warn(`pull-analyse: analyse failed for ${relativePath}: ${describe(cause)}`);
        }
      }),
    );
  }

  await Promise.all(pending);

  if (bigFileBuffer.length > 0) {
    const existing = await readBigFiles(input.metaPaths);
    const merged = mergeBigFileEntries(existing, bigFileBuffer);
    await writeBigFiles(input.metaPaths, merged);
  }

  logger.info(
    `pull-analyse done: smallFilesAnalysed=${smallFilesAnalysed} bigFilesQueued=${bigFileBuffer.filter((e) => e.reason === "context-window-exceeded").length} oversizedStubs=${oversizedStubs} skipped=${skipped} failed=${failed}`,
  );
  return {
    smallFilesAnalysed,
    bigFilesQueued: bigFileBuffer.filter((e) => e.reason === "context-window-exceeded").length,
    oversizedStubs,
    skipped,
    failed,
  };
}

function mergeBigFileEntries(existing: BigFileEntry[], additions: BigFileEntry[]): BigFileEntry[] {
  const byPath = new Map<string, BigFileEntry>();
  for (const entry of existing) {
    byPath.set(entry.relativePath, entry);
  }
  for (const entry of additions) {
    byPath.set(entry.relativePath, entry);
  }
  return [...byPath.values()];
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  let lines = 1;
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) {
      lines += 1;
    }
  }
  return lines;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
