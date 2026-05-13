import { askJsonLLM, tokenLen } from "@bb/llm";
import { logger } from "@bb/logger";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import type { ChunkAnalysisResult } from "src/types/big-file.ts";
import type { AnalyzedFileResult } from "src/types/pipeline.ts";
import { FALLBACK_LANGUAGE, emptyFileAnalysis } from "src/types/file-analysis.ts";
import { shapeAnalysis } from "src/adapters/llm-file-analyzer.ts";
import { CONDENSE_SYSTEM_PROMPT, buildCondenseUserPrompt } from "src/strategies/flat-folder/prompts/condense.ts";

export async function condenseChunks(relativePath: string, chunks: ChunkAnalysisResult[]): Promise<AnalyzedFileResult> {
  const dedupThreshold = getConfigValue(Config.SmallFileDedupThreshold);
  if (chunks.length === 0) {
    return { language: FALLBACK_LANGUAGE, analysis: emptyFileAnalysis() };
  }
  if (chunks.length <= dedupThreshold) {
    logger.info(`condenseChunks: ${relativePath} dedup-merging ${chunks.length} chunks`);
    return deterministicMerge(chunks);
  }
  logger.info(`condenseChunks: ${relativePath} recursive condense over ${chunks.length} chunks`);
  return await condenseRecursively(relativePath, chunks, 0);
}

async function condenseRecursively(
  relativePath: string,
  items: ChunkAnalysisResult[],
  depth: number,
): Promise<AnalyzedFileResult> {
  if (items.length === 1) {
    const only = items[0];
    if (only === undefined) {
      return { language: FALLBACK_LANGUAGE, analysis: emptyFileAnalysis() };
    }
    return { language: only.language, analysis: only.analysis };
  }
  const contextLimit = getConfigValue(Config.CondenseContextLimit);
  const promptOverhead = getConfigValue(Config.CondensePromptOverhead);
  const serialized = serializeItems(items);
  const promptTokens = tokenLen(serialized) + promptOverhead;
  if (promptTokens <= contextLimit) {
    return await condenseOne(relativePath, items);
  }
  const budget = Math.max(contextLimit - promptOverhead, 2000);
  const batches = batchByTokenBudget(items, budget);
  logger.info(
    `condenseChunks: ${relativePath} depth=${depth} items=${items.length} promptTokens=${promptTokens} -> ${batches.length} batches`,
  );
  const partials: AnalyzedFileResult[] = [];
  for (const batch of batches) {
    partials.push(await condenseOne(relativePath, batch));
  }
  return await condenseRecursively(relativePath, partials.map(toChunkResult), depth + 1);
}

async function condenseOne(relativePath: string, items: ChunkAnalysisResult[]): Promise<AnalyzedFileResult> {
  const serialized = serializeItems(items);
  const userPrompt = buildCondenseUserPrompt({ relativePath, serialized, count: items.length });
  try {
    const response = await askJsonLLM<Record<string, unknown>>(CONDENSE_SYSTEM_PROMPT, userPrompt);
    if (response.result !== null) {
      return shapeAnalysis(response.result);
    }
    logger.warn(`condenseOne: ${relativePath} unparseable JSON; falling back to dedup of ${items.length} items`);
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    logger.warn(`condenseOne: ${relativePath} askJsonLLM failed (${msg}); falling back to dedup`);
  }
  return deterministicMerge(items);
}

function deterministicMerge(items: ChunkAnalysisResult[]): AnalyzedFileResult {
  const language = items.find((i) => i.language !== FALLBACK_LANGUAGE)?.language ?? FALLBACK_LANGUAGE;
  const purposes = items.map((i) => i.analysis.purpose).filter((s) => s.length > 0);
  const summaries = items.map((i) => i.analysis.summary).filter((s) => s.length > 0);
  const contexts = items.map((i) => i.analysis.businessContext).filter((s) => s.length > 0);
  return {
    language,
    analysis: {
      purpose: purposes.join(" | "),
      summary: summaries.join(" | "),
      businessContext: contexts.join(" "),
      classes: unique(items.flatMap((i) => i.analysis.classes)),
      functions: unique(items.flatMap((i) => i.analysis.functions)),
      importsInternal: unique(items.flatMap((i) => i.analysis.importsInternal)),
      importsExternal: unique(items.flatMap((i) => i.analysis.importsExternal)),
      keywords: unique(items.flatMap((i) => i.analysis.keywords)).slice(0, 10),
    },
  };
}

function toChunkResult(r: AnalyzedFileResult): ChunkAnalysisResult {
  return {
    relativePath: "",
    chunkIndex: 0,
    totalChunks: 0,
    startLine: 0,
    endLine: 0,
    language: r.language,
    analysis: r.analysis,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

function batchByTokenBudget(items: ChunkAnalysisResult[], budget: number): ChunkAnalysisResult[][] {
  const batches: ChunkAnalysisResult[][] = [];
  let current: ChunkAnalysisResult[] = [];
  let currentTokens = 0;
  for (const item of items) {
    const itemTokens = tokenLen(serializeItem(item));
    if (currentTokens + itemTokens > budget && current.length > 0) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(item);
    currentTokens += itemTokens;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function serializeItems(items: ChunkAnalysisResult[]): string {
  return items.map((it, i) => `--- Item ${i + 1} ---\n${serializeItem(it)}`).join("\n\n");
}

function serializeItem(item: ChunkAnalysisResult): string {
  const a = item.analysis;
  return [
    `language: ${item.language}`,
    `lines: ${item.startLine}-${item.endLine}`,
    `purpose: ${a.purpose}`,
    `summary: ${a.summary}`,
    `businessContext: ${a.businessContext}`,
    `classes: ${JSON.stringify(a.classes)}`,
    `functions: ${JSON.stringify(a.functions)}`,
    `importsInternal: ${JSON.stringify(a.importsInternal)}`,
    `importsExternal: ${JSON.stringify(a.importsExternal)}`,
    `keywords: ${JSON.stringify(a.keywords)}`,
  ].join("\n");
}
