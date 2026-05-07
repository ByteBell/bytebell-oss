import { _getDb } from "./client.ts";
import { Collections } from "./collections.ts";

/**
 * Increment usage for an identity (user or org) for the current month
 *
 * @param identityId - The unique identifier for the user or organization
 * @param inputTokenCount - The number of input tokens
 * @param outputTokenCount - The number of output tokens
 */
export async function incrementUsage(
  identityId: string,
  inputTokenCount: number = 0,
  outputTokenCount: number = 0,
): Promise<void> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12

  await _getDb()
    .collection(Collections.Usage)
    .updateOne(
      { identityId, year, month },
      {
        $inc: {
          requestCount: 1,
          inputTokens: inputTokenCount,
          outputTokens: outputTokenCount,
          tokensUsed: inputTokenCount + outputTokenCount,
        },
        $set: {
          lastUpdated: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );
}

/**
 * Get monthly usage for all identities
 */
export async function getMonthlyUsage(year: number, month: number) {
  return await _getDb().collection(Collections.Usage).find({ year, month }).toArray();
}

/**
 * Get global aggregate usage
 */
export async function getGlobalUsage() {
  return await _getDb()
    .collection(Collections.Usage)
    .aggregate([
      {
        $group: {
          _id: null,
          totalRequests: { $sum: "$requestCount" },
          totalInputTokens: { $sum: "$inputTokens" },
          totalOutputTokens: { $sum: "$outputTokens" },
          totalTokens: { $sum: "$tokensUsed" },
        },
      },
    ])
    .toArray();
}
