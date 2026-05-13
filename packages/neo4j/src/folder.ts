import { _runCypher } from "./client.ts";
import type { NodeScope } from "./repo.ts";

export interface FolderSummaryPayload {
  purpose: string;
  summary: string;
  keywords: string[];
  classes: string[];
  functions: string[];
  importsInternal: string[];
  importsExternal: string[];
  dependencyGraph: string;
}

export interface UpsertFolderNodeInput {
  scope: NodeScope;
  folderPath: string;
  summary: FolderSummaryPayload;
}

const UPSERT_FOLDER = `
MERGE (folder:Folder {orgId: $orgId, knowledgeId: $knowledgeId, repoId: $repoId, folderPath: $folderPath})
SET folder.purpose = $purpose,
    folder.summary = $summary,
    folder.dependencyGraph = $dependencyGraph,
    folder.updatedAt = $updatedAt
WITH folder
MATCH (r:Repo {orgId: $orgId, knowledgeId: $knowledgeId, repoId: $repoId})
MERGE (r)-[:CONTAINS]->(folder)
`;

const CLEAR_FOLDER_KEYWORDS = `
MATCH (folder:Folder {orgId: $orgId, knowledgeId: $knowledgeId, repoId: $repoId, folderPath: $folderPath})-[rel:HAS_KEYWORD]->()
DELETE rel
`;

const ATTACH_FOLDER_KEYWORDS = `
MATCH (folder:Folder {orgId: $orgId, knowledgeId: $knowledgeId, repoId: $repoId, folderPath: $folderPath})
UNWIND $names AS name
MERGE (kw:Keyword {name: name})
MERGE (folder)-[:HAS_KEYWORD]->(kw)
`;

export async function upsertFolderNode(input: UpsertFolderNodeInput): Promise<void> {
  const scope = input.scope;
  const params = {
    orgId: scope.orgId,
    knowledgeId: scope.knowledgeId,
    repoId: scope.repoId,
    folderPath: input.folderPath,
  };
  await _runCypher(UPSERT_FOLDER, {
    ...params,
    purpose: input.summary.purpose,
    summary: input.summary.summary,
    dependencyGraph: input.summary.dependencyGraph,
    updatedAt: new Date().toISOString(),
  });
  await _runCypher(CLEAR_FOLDER_KEYWORDS, params);
  if (input.summary.keywords.length > 0) {
    await _runCypher(ATTACH_FOLDER_KEYWORDS, {
      ...params,
      names: input.summary.keywords.map((k) => k.toLowerCase()),
    });
  }
}
