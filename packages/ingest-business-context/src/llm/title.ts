import { askJsonLLM, type AskJsonLlmOptions, type LlmProviderName } from "@bb/llm";
import { logger } from "@bb/logger";
import { buildTitleGenerationPrompt } from "#src/prompt/title-prompt.ts";
import type { BusinessContextLlmOptions, TitleGenerationResult } from "#src/types.ts";

const FALLBACK_TITLE = "Untitled Business Context";

const KNOWN_PROVIDERS: ReadonlySet<string> = new Set(["openrouter", "ollama"]);

function buildLlmOpts(options: BusinessContextLlmOptions): AskJsonLlmOptions {
  const opts: AskJsonLlmOptions = { maxRetries: 2 };
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

/**
 * Runs the title-generation LLM call. Returns `FALLBACK_TITLE` if the LLM
 * returns nothing parseable — the rest of the pipeline still completes.
 */
export async function generateBusinessContextTitle(
  text: string,
  options: BusinessContextLlmOptions,
): Promise<TitleGenerationResult> {
  const systemPrompt = buildTitleGenerationPrompt();
  const result = await askJsonLLM<{ title?: unknown }>(systemPrompt, text, buildLlmOpts(options));

  const title =
    result.result !== null && typeof result.result.title === "string" && result.result.title.trim().length > 0
      ? result.result.title.trim()
      : FALLBACK_TITLE;

  logger.info(
    `business-context: title generated — "${title}" (model=${result.usage.model}, ${result.usage.inputTokens} in / ${result.usage.outputTokens} out)`,
  );

  return {
    title,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    modelName: result.usage.model,
  };
}
