import { runCypher } from "@bb/neo4j";
import { logger } from "@bb/logger";

const INDEX_DEFINITIONS: readonly string[] = [
  "CREATE INDEX business_context_by_knowledge IF NOT EXISTS FOR (bc:BusinessContext) ON (bc.knowledgeId)",
  "CREATE INDEX business_context_by_node_id IF NOT EXISTS FOR (bc:BusinessContext) ON (bc.nodeId)",
  "CREATE INDEX business_context_by_org IF NOT EXISTS FOR (bc:BusinessContext) ON (bc.orgId)",
  "CREATE INDEX business_context_version_by_knowledge_commit IF NOT EXISTS FOR (bv:BusinessContextVersion) ON (bv.knowledgeId, bv.commitHash)",
  "CREATE INDEX business_context_version_by_node_commit IF NOT EXISTS FOR (bv:BusinessContextVersion) ON (bv.nodeId, bv.commitHash)",
  "CREATE INDEX org_keyword_by_org_keyword IF NOT EXISTS FOR (k:OrgKeyword) ON (k.orgId, k.keyword)",
  "CREATE INDEX org_keyword_by_type IF NOT EXISTS FOR (k:OrgKeyword) ON (k.type)",
];

/**
 * Creates the indexes the business-context queries rely on. Safe to call
 * repeatedly — every statement uses `IF NOT EXISTS`. The worker invokes
 * this once before each Neo4j write.
 */
export async function ensureBusinessContextIndexes(): Promise<void> {
  for (const ddl of INDEX_DEFINITIONS) {
    await runCypher(ddl);
  }
  logger.info("business-context: indexes ensured");
}
