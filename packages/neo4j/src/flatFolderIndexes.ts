import { _runCypher } from "./client.ts";

const CONSTRAINTS = [
  "CREATE CONSTRAINT repo_unique IF NOT EXISTS FOR (r:Repo) REQUIRE (r.orgId, r.knowledgeId, r.repoId) IS UNIQUE",
  "CREATE CONSTRAINT folder_unique IF NOT EXISTS FOR (folder:Folder) REQUIRE (folder.orgId, folder.knowledgeId, folder.repoId, folder.folderPath) IS UNIQUE",
];

const FULLTEXT_INDEXES = [
  "CREATE FULLTEXT INDEX idx_repo_purpose_summary_ft IF NOT EXISTS FOR (r:Repo) ON EACH [r.purpose, r.summary, r.architecture]",
  "CREATE FULLTEXT INDEX idx_folder_purpose_summary_ft IF NOT EXISTS FOR (folder:Folder) ON EACH [folder.purpose, folder.summary]",
];

export async function ensureFlatFolderIndexes(): Promise<void> {
  for (const cypher of [...CONSTRAINTS, ...FULLTEXT_INDEXES]) {
    try {
      await _runCypher(cypher);
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      if (msg.includes("already exists") || msg.includes("EquivalentSchemaRuleAlreadyExists")) {
        process.stderr.write(`[neo4j] flat-folder schema already present, skipping: ${cypher.slice(0, 60)}…\n`);
        continue;
      }
      throw cause;
    }
  }
}
