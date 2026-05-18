import { logger } from "@bb/logger";
import { ensureBusinessContextIndexes } from "#src/neo4j/indexes.ts";
import { createBusinessContextKeywords } from "#src/neo4j/write-keywords.ts";
import { createBusinessContextNode } from "#src/neo4j/write-node.ts";
import { createBusinessContextVersionNode, linkVersionToFileVersions } from "#src/neo4j/write-version.ts";
import type { BusinessContextAnalysis, BusinessContextNeo4jResult } from "#src/types.ts";

export interface StoreGraphInput {
  knowledgeId: string;
  orgId: string;
  commitHash: string;
}

/**
 * Persists a completed `BusinessContextAnalysis` to Neo4j. Four steps:
 *
 *   1. Ensure indexes exist (idempotent).
 *   2. Merge the parent `:BusinessContext` and link from `:Knowledge`.
 *   3. Merge the per-commit `:BusinessContextVersion`, then MERGE `:DESCRIBES`
 *      edges to every `:FileVersion {knowledgeId, commitHash}` that exists.
 *   4. Merge `:OrgKeyword` nodes and `:APPEARS_IN_BUSINESS_CONTEXT` edges.
 */
export async function storeBusinessContextToNeo4j(
  input: StoreGraphInput,
  analysis: BusinessContextAnalysis,
  sanitizedTitle: string,
): Promise<BusinessContextNeo4jResult> {
  await ensureBusinessContextIndexes();

  const nodeCount = await createBusinessContextNode(
    { knowledgeId: input.knowledgeId, orgId: input.orgId },
    analysis,
    sanitizedTitle,
  );

  const versionCount = await createBusinessContextVersionNode(
    { knowledgeId: input.knowledgeId, orgId: input.orgId, commitHash: input.commitHash },
    analysis,
    sanitizedTitle,
  );

  const fileVersionEdges = await linkVersionToFileVersions(
    { knowledgeId: input.knowledgeId, orgId: input.orgId, commitHash: input.commitHash },
    sanitizedTitle,
  );

  const keywordEdges = await createBusinessContextKeywords(
    { knowledgeId: input.knowledgeId, orgId: input.orgId },
    analysis,
    sanitizedTitle,
  );

  logger.info(
    `business-context: graph stored — node=${nodeCount > 0}, version=${versionCount > 0}, fileVersion=${fileVersionEdges}, keywords=${keywordEdges}`,
  );

  return {
    businessContextNodeCreated: nodeCount > 0,
    versionNodeCreated: versionCount > 0,
    keywordRelationships: keywordEdges,
    fileVersionRelationships: fileVersionEdges,
  };
}
