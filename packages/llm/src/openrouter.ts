import { getConfigValue } from "@bb/config";
import { Config } from "@bb/types";
import { LlmConfigError, LlmError } from "@bb/errors";
import { tokenLen } from "./tokenizer.ts";
import type { AskLlmOptions, AskLlmResult } from "./client.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

interface OpenRouterUsageAccounting {
  /**
   * Opt-in flag that asks OpenRouter to populate `usage.cost` in the
   * response with the authoritative billed cost (in USD credits). Without
   * this, OpenRouter omits the cost field.
   */
  include: true;
}

interface OpenRouterRequest {
  model: string;
  models?: string[];
  messages: OpenRouterMessage[];
  usage: OpenRouterUsageAccounting;
}

interface OpenRouterResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
}

export function resolveOpenRouterChain(opts: AskLlmOptions): string[] {
  const apiKey = opts.apiKey ?? getConfigValue(Config.OpenrouterApiKey);
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
  // OpenRouter rejects `models: [...]` arrays with more than 3 entries (HTTP 400
  // "models array must have 3 items or fewer"). Cap the deduped chain at 3.
  return [...new Set(chain)].slice(0, 3);
}

export async function callOpenRouter(prompt: string, opts: AskLlmOptions, timeoutMs: number): Promise<AskLlmResult> {
  const apiKey = opts.apiKey ?? getConfigValue(Config.OpenrouterApiKey);
  const cappedChain = resolveOpenRouterChain(opts);
  const model = cappedChain[0] ?? opts.model ?? getConfigValue(Config.OpenrouterModel);

  const messages: OpenRouterMessage[] = [];
  if (opts.systemPrompt !== undefined) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const usageAccounting: OpenRouterUsageAccounting = { include: true };
  const body: OpenRouterRequest =
    cappedChain.length > 1
      ? { model, models: cappedChain, messages, usage: usageAccounting }
      : { model, messages, usage: usageAccounting };
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
    throw new LlmError(`OpenRouter HTTP ${response.status}`, undefined, {
      status: response.status,
      detail: text.slice(0, 4000),
    });
  }

  const json = (await response.json()) as OpenRouterResponse;
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new LlmError("OpenRouter returned empty completion");
  }
  return {
    content,
    usage: {
      model: typeof json.model === "string" && json.model.length > 0 ? json.model : model,
      inputTokens:
        typeof json.usage?.prompt_tokens === "number"
          ? json.usage.prompt_tokens
          : tokenLen((opts.systemPrompt ?? "") + prompt),
      outputTokens:
        typeof json.usage?.completion_tokens === "number" ? json.usage.completion_tokens : tokenLen(content),
      costUsd: typeof json.usage?.cost === "number" ? json.usage.cost : 0,
    },
  };
}
