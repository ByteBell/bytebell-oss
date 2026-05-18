import { tokenLen } from "@bb/llm";
import { logger } from "@bb/logger";
import { buildPartialAnalysisPrompt } from "#src/prompt/analysis-prompt.ts";
import { buildEnrichedUserMessage } from "#src/prompt/user-message.ts";
import { buildEnrichmentSection, type EnrichmentFocus } from "#src/llm/enrichment-format.ts";
import type { EnrichmentData } from "#src/llm/enrichment-reader.ts";

export interface AnalysisCallShape {
  name: string;
  fields: readonly string[];
  focus: EnrichmentFocus;
}

export interface BuiltCall {
  systemPrompt: string;
  userMessage: string;
}

/**
 * Builds the prompt pair for a single analysis call. If the combined
 * system+user token estimate exceeds the budget, the enrichment section is
 * trimmed proportionally and the user message is rebuilt — we never let the
 * prompt drift past the budget silently.
 */
export function buildAnalysisPromptForCall(
  call: AnalysisCallShape,
  text: string,
  title: string,
  enrichment: EnrichmentData,
  maxContextWindow: number,
): BuiltCall {
  const systemPrompt = buildPartialAnalysisPrompt(call.fields);
  let enrichmentSection = buildEnrichmentSection(enrichment, call.focus);
  let userMessage = buildEnrichedUserMessage(text, title, enrichmentSection);
  let totalTokens = tokenLen(systemPrompt) + tokenLen(userMessage);

  if (totalTokens > maxContextWindow && enrichmentSection.length > 0) {
    const ratio = (maxContextWindow / totalTokens) * 0.8;
    enrichmentSection = enrichmentSection.slice(0, Math.floor(enrichmentSection.length * ratio));
    userMessage = buildEnrichedUserMessage(text, title, enrichmentSection);
    totalTokens = tokenLen(systemPrompt) + tokenLen(userMessage);
    logger.warn(`business-context: call "${call.name}" trimmed enrichment to ~${totalTokens} tokens`);
  }

  return { systemPrompt, userMessage };
}
