import { runCypher } from "@bb/neo4j";
import type { BusinessContextAnalysis } from "#src/types.ts";

export interface BusinessContextVersionIdentity {
  knowledgeId: string;
  orgId: string;
  commitHash: string;
}

const MERGE_VERSION = `
MERGE (bv:BusinessContextVersion {
  knowledgeId: $knowledgeId,
  nodeId: $nodeId,
  commitHash: $commitHash
})
SET bv.orgId = $orgId,
    bv.analysisJson = $analysisJson,
    bv.updatedAt = $updatedAt
WITH bv
MATCH (bc:BusinessContext {nodeId: $nodeId, knowledgeId: $knowledgeId})
MERGE (bc)-[:HAS_VERSION]->(bv)
RETURN count(bv) AS count
`;

const LINK_TO_FILE_VERSIONS = `
MATCH (bv:BusinessContextVersion {knowledgeId: $knowledgeId, nodeId: $nodeId, commitHash: $commitHash})
WITH bv
MATCH (fv:FileVersion {knowledgeId: $knowledgeId, commitHash: $commitHash})
MERGE (bv)-[:DESCRIBES]->(fv)
RETURN count(fv) AS count
`;

/**
 * Creates or merges the `:BusinessContextVersion` snapshot for this commit and
 * connects it to the parent `:BusinessContext`. Stores the full analysis as a
 * JSON property on the version node so historical queries can reconstruct it
 * without re-reading disk.
 */
export async function createBusinessContextVersionNode(
  identity: BusinessContextVersionIdentity,
  analysis: BusinessContextAnalysis,
  sanitizedTitle: string,
): Promise<number> {
  const rows = await runCypher<{ count: number }>(MERGE_VERSION, {
    nodeId: sanitizedTitle,
    knowledgeId: identity.knowledgeId,
    orgId: identity.orgId,
    commitHash: identity.commitHash,
    analysisJson: JSON.stringify(analysis),
    updatedAt: new Date().toISOString(),
  });
  return rows.length > 0 ? Number(rows[0]?.count ?? 0) : 0;
}

/**
 * Links the `:BusinessContextVersion` to every `:FileVersion` that exists for
 * the same `(knowledgeId, commitHash)`. Returns the number of edges merged.
 * Zero matches → zero edges; re-running after files are snapshot will create
 * the missing edges (MERGE is idempotent).
 */
export async function linkVersionToFileVersions(
  identity: BusinessContextVersionIdentity,
  sanitizedTitle: string,
): Promise<number> {
  const rows = await runCypher<{ count: number }>(LINK_TO_FILE_VERSIONS, {
    nodeId: sanitizedTitle,
    knowledgeId: identity.knowledgeId,
    commitHash: identity.commitHash,
  });
  return rows.length > 0 ? Number(rows[0]?.count ?? 0) : 0;
}
