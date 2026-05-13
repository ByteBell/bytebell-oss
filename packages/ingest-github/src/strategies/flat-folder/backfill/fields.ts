import { askJsonLLM } from "@bb/llm";
import { logger } from "@bb/logger";
import type { MetaPaths } from "src/types/meta-paths.ts";
import { iterateCondensed } from "src/strategies/flat-folder/big-file/storage.ts";
import { saveCondensed } from "src/strategies/flat-folder/big-file/storage.ts";
import { BACKFILL_SYSTEM_PROMPT, buildBackfillUserPrompt } from "src/strategies/flat-folder/prompts/backfill.ts";

interface BackfillJson {
  keywords?: unknown;
  sideEffects?: unknown;
  configDependencies?: unknown;
  dataFlowDirection?: unknown;
}

export async function backfillMissingFields(metaPaths: MetaPaths): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;
  for await (const entry of iterateCondensed(metaPaths)) {
    const a = entry.analysis;
    const needsKeywords = a.keywords.length === 0;
    const needsSideEffects = a.sideEffects === undefined || a.sideEffects.length === 0;
    const needsConfigDeps = a.configDependencies === undefined || a.configDependencies.length === 0;
    const needsDataFlow = a.dataFlowDirection === undefined || a.dataFlowDirection.length === 0;
    if (!needsKeywords && !needsSideEffects && !needsConfigDeps && !needsDataFlow) {
      continue;
    }
    const userPrompt = buildBackfillUserPrompt(entry.relativePath, entry.analysis);
    try {
      const response = await askJsonLLM<BackfillJson>(BACKFILL_SYSTEM_PROMPT, userPrompt);
      const result = response.result;
      if (result === null) {
        continue;
      }
      if (needsKeywords) {
        a.keywords = pickStringArray(result.keywords);
      }
      if (needsSideEffects) {
        a.sideEffects = pickStringArray(result.sideEffects);
      }
      if (needsConfigDeps) {
        a.configDependencies = pickStringArray(result.configDependencies);
      }
      if (needsDataFlow && typeof result.dataFlowDirection === "string") {
        a.dataFlowDirection = result.dataFlowDirection;
      }
      await saveCondensed(metaPaths, entry);
      updated += 1;
    } catch (cause: unknown) {
      failed += 1;
      logger.warn(`phase3: backfill failed for ${entry.relativePath}: ${describe(cause)}`);
    }
  }
  logger.info(`phase3 done: updated=${updated} failed=${failed}`);
  return { updated, failed };
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

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
