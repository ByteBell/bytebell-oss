import type { ActivityInput } from "@bb/types";
import { _getDb } from "./client.ts";
import { Collections } from "./collections.ts";

/**
 * Record a detailed activity entry for an LLM interaction
 *
 * @param input - The activity data to record
 */
export async function recordActivity(input: ActivityInput): Promise<void> {
  const { response, ...rest } = input;
  const activity = {
    ...rest,
    responseSnippet: response.slice(0, 500), // Only store a snippet to save space
    createdAt: new Date(),
  };

  await _getDb().collection(Collections.Activity).insertOne(activity);
}
