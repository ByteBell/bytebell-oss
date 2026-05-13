import { askLLM, type AskLlmOptions, type AskLlmUsage } from "./client.ts";

export interface AskJsonLlmOptions extends AskLlmOptions {
  maxRetries?: number;
}

export interface AskJsonLlmResult<T> {
  result: T | null;
  usage: AskLlmUsage;
  raw: string;
}

const FENCE_PATTERN = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i;

export function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const match = FENCE_PATTERN.exec(trimmed);
  if (match !== null && match[1] !== undefined) {
    return match[1].trim();
  }
  return trimmed;
}

export function tryParseJson<T>(raw: string): T | null {
  const cleaned = stripJsonFence(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export interface AskYesNoLlmResult {
  decision: boolean | null;
  usage: AskLlmUsage;
  raw: string;
}

export async function askYesNoLLM(
  systemPrompt: string,
  userPrompt: string,
  opts: AskLlmOptions = {},
): Promise<AskYesNoLlmResult> {
  try {
    const { content, usage } = await askLLM(userPrompt, { ...opts, systemPrompt });
    const normalized = content.toUpperCase().trim();
    if (normalized.startsWith("YES")) {
      return { decision: true, usage, raw: content };
    }
    if (normalized.startsWith("NO")) {
      return { decision: false, usage, raw: content };
    }
    return { decision: null, usage, raw: content };
  } catch {
    return { decision: null, usage: { model: "", inputTokens: 0, outputTokens: 0 }, raw: "" };
  }
}

export async function askJsonLLM<T>(
  systemPrompt: string,
  userPrompt: string,
  opts: AskJsonLlmOptions = {},
): Promise<AskJsonLlmResult<T>> {
  const maxRetries = opts.maxRetries ?? 1;
  const baseOpts: AskLlmOptions = { ...opts, systemPrompt };

  let lastUsage: AskLlmUsage = { model: "", inputTokens: 0, outputTokens: 0 };
  let lastRaw = "";

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const { content, usage } = await askLLM(userPrompt, baseOpts);
    lastUsage = usage;
    lastRaw = content;
    const parsed = tryParseJson<T>(content);
    if (parsed !== null) {
      return { result: parsed, usage, raw: content };
    }
  }

  return { result: null, usage: lastUsage, raw: lastRaw };
}
