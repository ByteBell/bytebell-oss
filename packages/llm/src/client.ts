import { getConfigValue } from "@bb/config";
import { logger } from "@bb/logger";
import { Config } from "@bb/types";
import { computeCacheKey, getCachedDecision, isCacheEnabled, recordDecision, recordHit } from "./cache.ts";
import { callOllama, resolveOllamaChain } from "./ollama.ts";
import { callOpenRouter, resolveOpenRouterChain } from "./openrouter.ts";

const DEFAULT_TIMEOUT_MS = 360_000;

export type LlmProviderName = "openrouter" | "ollama";

export interface AskLlmOptions {
  model?: string;
  fallbackModels?: string[];
  timeoutMs?: number;
  systemPrompt?: string;
  /**
   * Per-call override of the OpenRouter API key. When set, takes precedence
   * over `Config.OpenrouterApiKey`. Used by downstream consumers (e.g. the
   * enterprise wrapper) that resolve per-org credentials at the enqueue
   * boundary and pass them through the job payload. Ignored by the Ollama
   * provider (which is keyless).
   */
  apiKey?: string;
  /**
   * Per-call override of `Config.LlmProvider`. When set, routes the call to
   * the named provider regardless of the configured default.
   */
  provider?: LlmProviderName;
}

export interface AskLlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AskLlmResult {
  content: string;
  usage: AskLlmUsage;
}

export async function askLLM(prompt: string, opts: AskLlmOptions = {}): Promise<AskLlmResult> {
  const provider: LlmProviderName = opts.provider ?? (getConfigValue(Config.LlmProvider) as LlmProviderName);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const chain = provider === "ollama" ? resolveOllamaChain(opts) : resolveOpenRouterChain(opts);

  const cacheOn = isCacheEnabled();
  const cacheKey = cacheOn
    ? computeCacheKey({
        provider,
        prompt,
        systemPrompt: opts.systemPrompt ?? null,
        modelChain: chain,
      })
    : null;
  if (cacheOn && cacheKey !== null) {
    const cached = await getCachedDecision(cacheKey);
    if (cached !== null) {
      const saved = cached.usage.inputTokens + cached.usage.outputTokens;
      logger.debug(`llm: cache hit (key=${cacheKey.slice(0, 8)}, tokens-saved=${saved})`);
      void recordHit(cacheKey);
      return { content: cached.content, usage: cached.usage };
    }
    logger.debug(`llm: cache miss (key=${cacheKey.slice(0, 8)})`);
  }

  const result =
    provider === "ollama" ? await callOllama(prompt, opts, timeoutMs) : await callOpenRouter(prompt, opts, timeoutMs);

  if (cacheOn && cacheKey !== null) {
    void recordDecision(cacheKey, {
      content: result.content,
      usage: result.usage,
      modelChain: chain,
    });
  }
  return result;
}
