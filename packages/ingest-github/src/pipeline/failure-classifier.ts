import { LlmConfigError, LlmError } from "@bb/errors";
import type { KnowledgeFailureCategory } from "@bb/types";
import { describe } from "./stats.ts";

export interface ClassifiedFailure {
  /** Operator-readable single-sentence summary. UI surfaces this directly. */
  reason: string;
  category: KnowledgeFailureCategory;
  /** Raw provider response or structured debug payload. Optional. */
  detail?: string;
}

/**
 * Translates a thrown ingestion error into the structured `(reason, category,
 * detail)` triple persisted on `KnowledgeDoc.failure` and stamped on the SSE
 * FAILED event.
 *
 * For LLM transport errors, the provider's HTTP status drives the category so
 * operators can distinguish "wrong key" (401/403) from "out of credits" (402)
 * from "throttled" (429) from "infra down" (5xx). Each path produces a short
 * sentence; the raw response body lands in `detail` for the disclosure UI.
 */
export function classifyFailure(cause: unknown): ClassifiedFailure {
  if (cause instanceof LlmConfigError) {
    return {
      category: "llm_config",
      reason: "LLM provider is not configured. Set the API key and retry.",
      detail: cause.message,
    };
  }
  if (cause instanceof LlmError) {
    return classifyLlmTransport(cause);
  }
  return { category: "internal", reason: describe(cause) };
}

function classifyLlmTransport(cause: LlmError): ClassifiedFailure {
  const status = cause.status;
  const detail = cause.detail ?? cause.message;
  if (status === 401 || status === 403) {
    return {
      category: "llm_auth",
      reason: "LLM provider rejected the API key. Update the key and retry.",
      detail,
    };
  }
  if (status === 402) {
    return {
      category: "llm_quota",
      reason: "LLM provider is out of credits or over its spend limit. Top up and retry.",
      detail,
    };
  }
  if (status === 429) {
    return {
      category: "llm_rate_limit",
      reason: "LLM provider rate-limited the request. Wait and retry.",
      detail,
    };
  }
  if (status !== undefined && status >= 500 && status < 600) {
    return {
      category: "llm_unreachable",
      reason: `LLM provider responded with HTTP ${String(status)}. Provider is temporarily unavailable.`,
      detail,
    };
  }
  // Network/timeout (no status) or any other non-OK status.
  return {
    category: "llm_unreachable",
    reason:
      status === undefined
        ? "LLM provider is unreachable (network error or timeout)."
        : `LLM provider responded with HTTP ${String(status)}.`,
    detail,
  };
}
