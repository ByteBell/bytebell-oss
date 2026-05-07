import { getConfigValue } from "@bb/config";
import { Config } from "@bb/types";
import { LlmConfigError, LlmError } from "@bb/errors";
import { computeCacheKey, getCachedDecision, isCacheEnabled, recordDecision, recordHit } from "./cache.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 360_000;

export interface AskLlmOptions {
  model?: string;
  fallbackModels?: string[];
  timeoutMs?: number;
  systemPrompt?: string;
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

interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

interface OpenRouterRequest {
  model: string;
  models?: string[];
  messages: OpenRouterMessage[];
}

interface OpenRouterResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export async function askLLM(prompt: string, opts: AskLlmOptions = {}): Promise<AskLlmResult> {
  const apiKey = getConfigValue(Config.OpenrouterApiKey);
  if (apiKey.length === 0) {
    throw new LlmConfigError("bytebell keys set");
  }
  const model = opts.model ?? getConfigValue(Config.OpenrouterModel);
  const fallbackSlots = opts.fallbackModels ?? [
    getConfigValue(Config.OpenrouterFallbackModel1),
    getConfigValue(Config.OpenrouterFallbackModel2),
    getConfigValue(Config.OpenrouterFallbackModel3),
    getConfigValue(Config.OpenrouterFallbackModel4),
  ];
  const chain = [model, ...fallbackSlots].filter((m) => m.length > 0);
  const uniqueChain = [...new Set(chain)];
  // OpenRouter rejects `models: [...]` arrays with more than 3 entries (HTTP 400
  // "models array must have 3 items or fewer"). The four fallback slots remain
  // configurable; we send the primary plus the first 2 non-empty fallbacks.
  const cappedChain = uniqueChain.slice(0, 3);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const cacheOn = isCacheEnabled();
  const cacheKey = cacheOn
    ? computeCacheKey({
        prompt,
        systemPrompt: opts.systemPrompt ?? null,
        modelChain: cappedChain,
      })
    : null;
  if (cacheOn && cacheKey !== null) {
    const cached = await getCachedDecision(cacheKey);
    if (cached !== null) {
      const saved = cached.usage.inputTokens + cached.usage.outputTokens;
      console.info(`[LLM CACHE HIT] key=${cacheKey.slice(0, 8)} tokens-saved=${saved}`);
      void recordHit(cacheKey);
      return { content: cached.content, usage: cached.usage };
    }
    console.info(`[LLM CACHE MISS] key=${cacheKey.slice(0, 8)}`);
  }

  const messages: OpenRouterMessage[] = [];
  if (opts.systemPrompt !== undefined) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const body: OpenRouterRequest =
    cappedChain.length > 1 ? { model, models: cappedChain, messages } : { model, messages };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause: unknown) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new LlmError(`OpenRouter request timed out after ${timeoutMs}ms`, cause);
    }
    throw new LlmError("OpenRouter request failed", cause);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new LlmError(`OpenRouter HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const json = (await response.json()) as OpenRouterResponse;
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new LlmError("OpenRouter returned empty completion");
  }
  const result: AskLlmResult = {
    content,
    usage: {
      model: typeof json.model === "string" && json.model.length > 0 ? json.model : model,
      inputTokens: typeof json.usage?.prompt_tokens === "number" ? json.usage.prompt_tokens : 0,
      outputTokens: typeof json.usage?.completion_tokens === "number" ? json.usage.completion_tokens : 0,
    },
  };
  if (cacheOn && cacheKey !== null) {
    void recordDecision(cacheKey, {
      content: result.content,
      usage: result.usage,
      modelChain: cappedChain,
    });
  }
  return result;
}
