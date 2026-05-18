import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { askJsonLLM, type AskLlmOptions } from "@bb/llm";
import { logger } from "@bb/logger";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import type { CondensedFileAnalysis } from "#src/types/condensed-file-analysis.ts";
import type { MetaPaths } from "#src/types/meta-paths.ts";
import { encodeMetaPath } from "#src/pipeline/paths.ts";
import { withConcurrency } from "#src/pipeline/concurrency.ts";
import { throwIfCancelled, CancellationError } from "#src/pipeline/cancellation.ts";
import type { ProgressContext } from "#src/progress/types.ts";
import { iterateCondensed } from "./big-file/storage.ts";
import { directFolderOf } from "./folder-path.ts";
import { FOLDER_ANALYSIS_SYSTEM_PROMPT, folderAnalysisUserPrompt } from "./prompts/folder-summary.ts";
import type { FolderSummary } from "./types.ts";

export async function groupByDirectFolder(metaPaths: MetaPaths): Promise<Map<string, CondensedFileAnalysis[]>> {
  const groups = new Map<string, CondensedFileAnalysis[]>();
  for await (const entry of iterateCondensed(metaPaths)) {
    const folder = directFolderOf(entry.relativePath);
    const bucket = groups.get(folder) ?? [];
    bucket.push(entry);
    groups.set(folder, bucket);
  }
  return groups;
}

interface FolderSummaryJson {
  purpose?: unknown;
  summary?: unknown;
  keywords?: unknown;
  classes?: unknown;
  functions?: unknown;
  importsInternal?: unknown;
  importsExternal?: unknown;
  dependencyGraph?: unknown;
}

export async function summariseFolder(
  folderPath: string,
  files: CondensedFileAnalysis[],
  llmCallContext?: AskLlmOptions,
): Promise<{ summary: FolderSummary | null; tokenUsage: { inputTokens: number; outputTokens: number } }> {
  const userPrompt = folderAnalysisUserPrompt(folderPath, files);
  try {
    const response = await askJsonLLM<FolderSummaryJson>(
      FOLDER_ANALYSIS_SYSTEM_PROMPT,
      userPrompt,
      llmCallContext ?? {},
    );
    if (response.result === null) {
      logger.warn(`summariseFolder: ${folderPath || "<root>"} returned unparseable JSON`);
      return {
        summary: null,
        tokenUsage: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens },
      };
    }
    return {
      summary: shapeFolderSummary(folderPath, response.result),
      tokenUsage: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens },
    };
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    logger.warn(`summariseFolder: ${folderPath || "<root>"} askJsonLLM failed: ${msg}`);
    return { summary: null, tokenUsage: { inputTokens: 0, outputTokens: 0 } };
  }
}

export async function persistFolderSummary(metaPaths: MetaPaths, summary: FolderSummary): Promise<void> {
  const file = path.join(metaPaths.folderSummariesDir, `${encodeMetaPath(summary.folderPath || "__ROOT__")}.json`);
  await writeFile(file, JSON.stringify(summary, null, 2), "utf8");
}

export async function* iterateFolderSummaries(metaPaths: MetaPaths): AsyncGenerator<FolderSummary> {
  let entries: string[];
  try {
    entries = await readdir(metaPaths.folderSummariesDir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.endsWith(".json")) {
      continue;
    }
    try {
      const raw = await readFile(path.join(metaPaths.folderSummariesDir, name), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        yield parsed as FolderSummary;
      }
    } catch {
      continue;
    }
  }
}

export async function runFolderSummaryPhase(
  knowledgeId: string,
  metaPaths: MetaPaths,
  llmCallContext?: AskLlmOptions,
  progressContext?: ProgressContext,
): Promise<{ succeeded: number; failed: number; tokenUsage: { inputTokens: number; outputTokens: number } }> {
  const concurrentWorkers = getConfigValue(Config.ConcurrentWorkers);
  const limit = withConcurrency(concurrentWorkers);
  const groups = await groupByDirectFolder(metaPaths);
  let succeeded = 0;
  let failed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const reporter = progressContext?.reporter({
    phase: "folder_analysis",
    total: { kind: "fixed", total: groups.size },
  });
  await reporter?.start();
  try {
    const tasks: Promise<void>[] = [];
    for (const [folderPath, files] of groups.entries()) {
      tasks.push(
        limit(async () => {
          try {
            throwIfCancelled(knowledgeId);
            const { summary, tokenUsage } = await summariseFolder(folderPath, files, llmCallContext);
            totalInputTokens += tokenUsage.inputTokens;
            totalOutputTokens += tokenUsage.outputTokens;
            if (summary !== null) {
              await persistFolderSummary(metaPaths, summary);
              succeeded += 1;
            } else {
              failed += 1;
            }
          } catch (cause: unknown) {
            if (cause instanceof CancellationError) {
              throw cause;
            }
            failed += 1;
            logger.warn(`phase5: folder summary failed for ${folderPath || "<root>"}`);
          } finally {
            reporter?.increment(1, { fileName: folderPath || "<root>" });
          }
        }),
      );
    }
    await Promise.all(tasks);
  } finally {
    reporter?.stop();
  }
  logger.info(`phase5 done: foldersSummarised=${succeeded} failed=${failed}`);
  return { succeeded, failed, tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens } };
}

function shapeFolderSummary(folderPath: string, raw: FolderSummaryJson): FolderSummary {
  return {
    folderPath,
    purpose: pickString(raw.purpose, ""),
    summary: pickString(raw.summary, ""),
    keywords: pickStringArray(raw.keywords),
    classes: pickStringArray(raw.classes),
    functions: pickStringArray(raw.functions),
    importsInternal: pickStringArray(raw.importsInternal),
    importsExternal: pickStringArray(raw.importsExternal),
    dependencyGraph: pickString(raw.dependencyGraph, ""),
    generatedAt: new Date().toISOString(),
  };
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
    }
  }
  return out;
}
