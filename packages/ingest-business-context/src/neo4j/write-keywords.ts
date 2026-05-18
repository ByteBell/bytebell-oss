import { runCypher } from "@bb/neo4j";
import { BUSINESS_CONTEXT_KEYWORD_TYPES } from "#src/neo4j/relationship-types.ts";
import type { BusinessContextAnalysis } from "#src/types.ts";

export interface BusinessContextKeywordIdentity {
  knowledgeId: string;
  orgId: string;
}

const MERGE_KEYWORDS = `
UNWIND $keywords AS kwData
MERGE (kw:OrgKeyword {orgId: $orgId, keyword: kwData.word, type: $relType})
WITH kw
MATCH (bc:BusinessContext {nodeId: $nodeId, knowledgeId: $knowledgeId})
MERGE (kw)-[:APPEARS_IN_BUSINESS_CONTEXT]->(bc)
RETURN count(*) AS count
`;

function pickArrayField(analysis: BusinessContextAnalysis, field: string): string[] {
  const value = (analysis as unknown as Record<string, unknown>)[field];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Creates `:OrgKeyword` nodes for every populated array field and connects
 * them to the parent `:BusinessContext`. One MERGE per relationship class —
 * keeps the writes batched and idempotent. Returns the total count of edges
 * (created or pre-existing) across all classes.
 */
export async function createBusinessContextKeywords(
  identity: BusinessContextKeywordIdentity,
  analysis: BusinessContextAnalysis,
  sanitizedTitle: string,
): Promise<number> {
  let total = 0;
  for (const [field, relType] of Object.entries(BUSINESS_CONTEXT_KEYWORD_TYPES)) {
    const words = pickArrayField(analysis, field);
    if (words.length === 0) {
      continue;
    }

    const rows = await runCypher<{ count: number }>(MERGE_KEYWORDS, {
      keywords: words.map((w) => ({ word: w })),
      relType,
      orgId: identity.orgId,
      nodeId: sanitizedTitle,
      knowledgeId: identity.knowledgeId,
    });
    if (rows.length > 0) {
      total += Number(rows[0]?.count ?? 0);
    }
  }
  return total;
}
