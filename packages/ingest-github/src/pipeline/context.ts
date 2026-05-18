import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import type { AskLlmOptions } from "@bb/llm";

export function resolveOrgId(payload: { orgId?: string }): string {
  if (typeof payload.orgId === "string" && payload.orgId.length > 0) {
    return payload.orgId;
  }
  return getConfigValue(Config.OrgId);
}

export function llmCallContextFromPayload(payload: {
  llmApiKey?: string;
  llmProvider?: string;
  llmModel?: string;
}): AskLlmOptions | undefined {
  const ctx: AskLlmOptions = {};
  if (payload.llmApiKey !== undefined && payload.llmApiKey.length > 0) {
    ctx.apiKey = payload.llmApiKey;
  }
  if (payload.llmProvider === "openrouter" || payload.llmProvider === "ollama") {
    ctx.provider = payload.llmProvider;
  }
  if (payload.llmModel !== undefined && payload.llmModel.length > 0) {
    ctx.model = payload.llmModel;
  }
  return Object.keys(ctx).length > 0 ? ctx : undefined;
}
