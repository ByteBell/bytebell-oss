import { runCypher } from "@bb/neo4j";
import { serializeArrayForNeo4j } from "#src/neo4j/serialize.ts";
import type { BusinessContextAnalysis } from "#src/types.ts";

export interface BusinessContextNodeIdentity {
  knowledgeId: string;
  orgId: string;
}

const MERGE_BUSINESS_CONTEXT = `
MERGE (bc:BusinessContext {nodeId: $nodeId, knowledgeId: $knowledgeId})
SET bc.orgId = $orgId,
    bc.title = $title,
    bc.productArea = $productArea,
    bc.summary = $summary,
    bc.businessValue = $businessValue,
    bc.technicalSummary = $technicalSummary,
    bc.userImpact = $userImpact,
    bc.keywordsText = $keywordsText,
    bc.domainKeywordsText = $domainKeywordsText,
    bc.updatedAt = $updatedAt
WITH bc
MATCH (k:Knowledge {knowledgeId: $knowledgeId})
MERGE (k)-[:HAS_BUSINESS_CONTEXT]->(bc)
RETURN count(bc) AS count
`;

/**
 * Creates or updates the parent `:BusinessContext` node, then links it from
 * the owning `:Knowledge`. Idempotent — MERGE on `(nodeId, knowledgeId)` means
 * resubmitting the same BC returns the same node.
 */
export async function createBusinessContextNode(
  identity: BusinessContextNodeIdentity,
  analysis: BusinessContextAnalysis,
  sanitizedTitle: string,
): Promise<number> {
  const rows = await runCypher<{ count: number }>(MERGE_BUSINESS_CONTEXT, {
    nodeId: sanitizedTitle,
    knowledgeId: identity.knowledgeId,
    orgId: identity.orgId,
    title: analysis.title,
    productArea: analysis.product_area,
    summary: analysis.summary,
    businessValue: analysis.business_value,
    technicalSummary: analysis.technical_summary,
    userImpact: analysis.user_impact,
    keywordsText: serializeArrayForNeo4j(analysis.keywords),
    domainKeywordsText: serializeArrayForNeo4j(analysis.domain_keywords),
    updatedAt: new Date().toISOString(),
  });
  return rows.length > 0 ? Number(rows[0]?.count ?? 0) : 0;
}
