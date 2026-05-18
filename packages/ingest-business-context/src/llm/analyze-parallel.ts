import { askJsonLLM, type AskJsonLlmOptions, type LlmProviderName, tokenLen } from "@bb/llm";
import { logger } from "@bb/logger";
import { PRODUCT_FIELDS, SHARED_FIELDS, TECHNICAL_FIELDS } from "#src/field-defs.ts";
import { buildAnalysisPromptForCall } from "#src/llm/call-builder.ts";
import type { EnrichmentData } from "#src/llm/enrichment-reader.ts";
import type { EnrichmentFocus } from "#src/llm/enrichment-format.ts";
import { mergeAnalysisFields } from "#src/llm/merge.ts";
import type { AnalysisResult, BusinessContextAnalysis, BusinessContextLlmOptions } from "#src/types.ts";

const MAX_CONTEXT_WINDOW = 50_000;
const KNOWN_PROVIDERS: ReadonlySet<string> = new Set(["openrouter", "ollama"]);

interface AnalysisCall {
  name: string;
  fields: readonly string[];
  focus: EnrichmentFocus;
}

const CALLS: readonly AnalysisCall[] = [
  { name: "product", fields: PRODUCT_FIELDS, focus: "product" },
  { name: "technical", fields: TECHNICAL_FIELDS, focus: "technical" },
  { name: "shared", fields: SHARED_FIELDS, focus: "shared" },
];

function buildLlmOpts(options: BusinessContextLlmOptions): AskJsonLlmOptions {
  const opts: AskJsonLlmOptions = { maxRetries: 3 };
  if (options.apiKey !== undefined) {
    opts.apiKey = options.apiKey;
  }
  if (options.model !== undefined) {
    opts.model = options.model;
  }
  if (options.provider !== undefined && KNOWN_PROVIDERS.has(options.provider)) {
    opts.provider = options.provider as LlmProviderName;
  }
  return opts;
}

async function runOneCall(
  call: AnalysisCall,
  text: string,
  title: string,
  enrichment: EnrichmentData,
  baseOpts: AskJsonLlmOptions,
): Promise<{
  result: Partial<BusinessContextAnalysis> | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const { systemPrompt, userMessage } = buildAnalysisPromptForCall(call, text, title, enrichment, MAX_CONTEXT_WINDOW);
  const promptTokens = tokenLen(systemPrompt) + tokenLen(userMessage);
  logger.info(`business-context: call "${call.name}" ~${promptTokens} tokens, ${call.fields.length} fields`);

  const r = await askJsonLLM<Partial<BusinessContextAnalysis>>(systemPrompt, userMessage, baseOpts);
  return {
    result: r.result,
    model: r.usage.model,
    inputTokens: r.usage.inputTokens,
    outputTokens: r.usage.outputTokens,
  };
}

/**
 * Runs the three analysis LLM calls in parallel (product, technical, shared)
 * and merges the partial results into a single `BusinessContextAnalysis`.
 * Returns `analysis: null` only when every call returned null — caller treats
 * that as a fatal failure.
 */
export async function analyzeBusinessContextParallel(
  text: string,
  title: string,
  enrichment: EnrichmentData,
  options: BusinessContextLlmOptions,
): Promise<AnalysisResult> {
  const baseOpts = buildLlmOpts(options);
  const calls = await Promise.all(CALLS.map((c) => runOneCall(c, text, title, enrichment, baseOpts)));

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let modelName = "";
  let nonNullResults = 0;
  const merged: Record<string, unknown> = {};

  for (let i = 0; i < calls.length; i += 1) {
    const r = calls[i];
    const callName = CALLS[i]?.name ?? "?";
    if (r === undefined) {
      continue;
    }
    totalInputTokens += r.inputTokens;
    totalOutputTokens += r.outputTokens;
    if (modelName.length === 0 && r.model.length > 0) {
      modelName = r.model;
    }
    if (r.result !== null) {
      nonNullResults += 1;
      Object.assign(merged, r.result);
      logger.info(`business-context: call "${callName}" done (${r.inputTokens} in / ${r.outputTokens} out)`);
    } else {
      logger.warn(`business-context: call "${callName}" returned null — fields will use defaults`);
    }
  }

  if (nonNullResults === 0) {
    return { analysis: null, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, modelName };
  }

  const analysis = mergeAnalysisFields(merged, title);
  return { analysis, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, modelName };
}
