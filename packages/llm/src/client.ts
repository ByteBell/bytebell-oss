import { getConfigValue } from "@bb/config";
import { Config } from "@bb/types";
import { LlmConfigError, LlmError } from "@bb/errors";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 90_000;

export interface AskLlmOptions {
  model?: string;
  timeoutMs?: number;
  systemPrompt?: string;
}

interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function askLLM(prompt: string, opts: AskLlmOptions = {}): Promise<string> {
  const apiKey = getConfigValue(Config.OpenrouterApiKey);
  if (apiKey.length === 0) {
    throw new LlmConfigError("bytebell keys set");
  }
  const model = opts.model ?? getConfigValue(Config.OpenrouterModel);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const messages: OpenRouterMessage[] = [];
  if (opts.systemPrompt !== undefined) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const body: OpenRouterRequest = { model, messages };
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
  return content;
}
