import type { ActivityInput } from "@bb/types";
import { incrementUsage, recordActivity } from "@bb/mongo";
import { tokenLen } from "./tokenizer.ts";

/**
 * UsageTracker
 *
 * Orchestrates token counting and persistence for LLM interactions.
 * Inspired by the mcp-server usage tracking architecture.
 */
export class UsageTracker {
  /**
   * Track an LLM interaction (request + response)
   *
   * @param identityId - The user or organization ID
   * @param toolName - The name of the tool or operation
   * @param query - The input query text
   * @param response - The output response text
   * @param durationMs - The time taken for the interaction
   */
  static async track(
    identityId: string,
    toolName: string,
    query: string,
    response: string,
    durationMs: number,
  ): Promise<void> {
    try {
      const inputTokens = tokenLen(query);
      const outputTokens = tokenLen(response);

      // 1. Increment monthly usage (Atomic update)
      await incrementUsage(identityId, inputTokens, outputTokens);

      // 2. Record detailed activity log
      const activity: ActivityInput = {
        identityId,
        toolName,
        query,
        response,
        durationMs,
        tokens: {
          input: inputTokens,
          output: outputTokens,
        },
      };
      await recordActivity(activity);
    } catch (error) {
      // Failure in tracking should not break the main application flow
      console.error("[UsageTracker] Failed to track usage:", error);
    }
  }

  /**
   * Helper to count tokens for a string
   */
  static countTokens(text: string): number {
    return tokenLen(text);
  }
}
