import path from "node:path";
import { tokenLen, type AskLlmOptions } from "@bb/llm";
import { LlmConfigError, LlmError } from "@bb/errors";
import { logger } from "@bb/logger";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import type { ArchiveSink, FileAnalyzer, SkipDecider, SourceReader } from "#src/types/pipeline.ts";
import type { MetaPaths } from "#src/types/meta-paths.ts";
import type { BigFileEntry } from "#src/types/big-file.ts";
import type { ProgressContext } from "#src/progress/types.ts";
import { withConcurrency } from "#src/pipeline/concurrency.ts";
import { throwIfCancelled, CancellationError } from "#src/pipeline/cancellation.ts";
import { makeSkipDecider } from "#src/pipeline/skip-decisions/index.ts";
import { analyseScannedFile, buildOversizedStub } from "#src/strategies/flat-folder/analyse-file.ts";
import { saveCondensed } from "#src/strategies/flat-folder/big-file/storage.ts";
import { writeBigFiles } from "#src/strategies/flat-folder/big-file/detector.ts";

export interface ClassifyPhaseInput {
  knowledgeId: string;
  source: SourceReader;
  metaPaths: MetaPaths;
  analyzer: FileAnalyzer;
  skipDecider?: SkipDecider;
  archiveSink?: ArchiveSink;
  llmCallContext?: AskLlmOptions;
  progressContext?: ProgressContext;
}

export interface ClassifyPhaseResult {
  smallFilesAnalysed: number;
  bigFilesQueued: number;
  oversizedStubs: number;
  failed: number;
  tokenUsage: { inputTokens: number; outputTokens: number; costUsd: number };
}

export async function classifyAndAnalyseSmall(input: ClassifyPhaseInput): Promise<ClassifyPhaseResult> {
  const contextWindowLimit = getConfigValue(Config.ContextWindowLimit);
  const concurrentWorkers = getConfigValue(Config.ConcurrentWorkers);
  const limit = withConcurrency(concurrentWorkers);
  const bigFileBuffer: BigFileEntry[] = [];
  let smallFilesAnalysed = 0;
  let oversizedStubs = 0;
  let failed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  const repositoryHint =
    input.source.localRepoDir.length > 0 ? path.basename(input.source.localRepoDir) : input.knowledgeId;
  const skipDecider = input.skipDecider ?? makeSkipDecider({ repositoryName: repositoryHint });

  const pending: Promise<void>[] = [];

  const reporter = input.progressContext?.reporter({
    phase: "file_analysis",
    total: { kind: "growing" },
  });
  await reporter?.start();

  try {
    const scanDeps: Parameters<typeof input.source.scan>[0] = { skipDecider };
    if (input.llmCallContext !== undefined) {
      scanDeps.llmCallContext = input.llmCallContext;
    }
    for await (const entry of input.source.scan(scanDeps)) {
      throwIfCancelled(input.knowledgeId);
      reporter?.incrementSeen();

      if (entry.kind === "oversized") {
        bigFileBuffer.push({
          relativePath: entry.relativePath,
          sizeBytes: entry.sizeBytes,
          tokenCount: 0,
          reason: "too-large",
        });
        try {
          await saveCondensed(input.metaPaths, buildOversizedStub(entry.relativePath, entry.sizeBytes));
          oversizedStubs += 1;
          reporter?.increment(1, { fileName: entry.relativePath });
        } catch (cause: unknown) {
          failed += 1;
          logger.warn(`phase1: oversized stub write failed for ${entry.relativePath}: ${describe(cause)}`);
        }
        continue;
      }

      const tokenCount = tokenLen(entry.content);
      if (tokenCount > contextWindowLimit) {
        bigFileBuffer.push({
          relativePath: entry.relativePath,
          sizeBytes: entry.sizeBytes,
          tokenCount,
          reason: "context-window-exceeded",
        });
        // Big files are accounted for here; phase 2 has its own reporter.
        reporter?.increment(1, { fileName: entry.relativePath });
        continue;
      }

      const fileContent = entry.content;
      const filePath = entry.relativePath;
      pending.push(
        limit(async () => {
          try {
            throwIfCancelled(input.knowledgeId);
            const condensed = await analyseScannedFile(input.analyzer, entry, input.llmCallContext);
            await saveCondensed(input.metaPaths, condensed);
            if (input.archiveSink !== undefined) {
              await input.archiveSink.push({
                knowledgeId: input.knowledgeId,
                relativePath: filePath,
                content: fileContent,
              });
            }
            if (condensed.tokenUsage) {
              totalInputTokens += condensed.tokenUsage.inputTokens;
              totalOutputTokens += condensed.tokenUsage.outputTokens;
              totalCostUsd += condensed.tokenUsage.costUsd;
            }
            smallFilesAnalysed += 1;
            reporter?.increment(1, { fileName: filePath });
          } catch (cause: unknown) {
            if (cause instanceof CancellationError) {
              throw cause;
            }
            if (cause instanceof LlmConfigError || cause instanceof LlmError) {
              // LLM unreachable — bail the whole job, don't keep iterating
              // over the rest of the files producing the same failure.
              throw cause;
            }
            failed += 1;
            logger.warn(`phase1: analyse failed for ${entry.relativePath}: ${describe(cause)}`);
            reporter?.increment(1, { fileName: filePath });
          }
        }),
      );
    }

    await Promise.all(pending);

    await writeBigFiles(input.metaPaths, bigFileBuffer);
  } finally {
    reporter?.stop();
  }

  logger.info(
    `phase1 done: smallFilesAnalysed=${smallFilesAnalysed} bigFilesQueued=${bigFileBuffer.filter((e) => e.reason === "context-window-exceeded").length} oversizedStubs=${oversizedStubs} failed=${failed}`,
  );
  return {
    smallFilesAnalysed,
    bigFilesQueued: bigFileBuffer.filter((e) => e.reason === "context-window-exceeded").length,
    oversizedStubs,
    failed,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd },
  };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
