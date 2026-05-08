import type { FileAnalysis } from "@bb/mongo";
import { _runCypher } from "./client.ts";

const UPSERT_FILE = `
MERGE (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
SET f.language = $language,
    f.sha = $sha,
    f.sizeBytes = $sizeBytes,
    f.purpose = $purpose,
    f.summary = $summary,
    f.businessContext = $businessContext,
    f.updatedAt = $updatedAt
WITH f
MATCH (k:Knowledge {knowledgeId: $knowledgeId})
MERGE (k)-[:HAS_FILE]->(f)
`;

const CLEAR_KEYWORDS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})-[r:HAS_KEYWORD]->()
DELETE r
`;

const CLEAR_CLASSES = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})-[r:HAS_CLASS]->()
DELETE r
`;

const CLEAR_FUNCTIONS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})-[r:HAS_FUNCTION]->()
DELETE r
`;

const CLEAR_IMPORTS_INTERNAL = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})-[r:HAS_IMPORT_INTERNAL]->()
DELETE r
`;

const CLEAR_IMPORTS_EXTERNAL = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})-[r:HAS_IMPORT_EXTERNAL]->()
DELETE r
`;

const ATTACH_KEYWORDS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
UNWIND $names AS name
MERGE (kw:Keyword {name: name})
MERGE (f)-[:HAS_KEYWORD]->(kw)
`;

const ATTACH_CLASSES = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
UNWIND $signatures AS signature
MERGE (c:Class {signature: signature})
MERGE (f)-[:HAS_CLASS]->(c)
`;

const ATTACH_FUNCTIONS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
UNWIND $signatures AS signature
MERGE (fn:Function {signature: signature})
MERGE (f)-[:HAS_FUNCTION]->(fn)
`;

const ATTACH_IMPORTS_INTERNAL = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
UNWIND $names AS name
MERGE (m:Module {name: name})
MERGE (f)-[:HAS_IMPORT_INTERNAL]->(m)
`;

const ATTACH_IMPORTS_EXTERNAL = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
UNWIND $names AS name
MERGE (m:Module {name: name})
MERGE (f)-[:HAS_IMPORT_EXTERNAL]->(m)
`;

export interface UpsertFileNodeInput {
  knowledgeId: string;
  relativePath: string;
  language: string;
  sha: string;
  sizeBytes: number;
  analysis: FileAnalysis;
}

const DELETE_FILES = `
MATCH (f:File {knowledgeId: $knowledgeId})
WHERE f.relativePath IN $relativePaths
DETACH DELETE f
`;

/**
 * Removes the live `:File` nodes for `relativePaths` under `knowledgeId`,
 * along with their relationships. Callers that need history (e.g. the pull
 * worker) must call `snapshotFilesToVersion` first; this only touches the
 * live `:File` set, never `:FileVersion`.
 *
 * No-op when `relativePaths` is empty.
 */
export async function deleteFileNodes(knowledgeId: string, relativePaths: string[]): Promise<void> {
  if (relativePaths.length === 0) {
    return;
  }
  await _runCypher(DELETE_FILES, { knowledgeId, relativePaths });
}

export async function upsertFileNode(input: UpsertFileNodeInput): Promise<void> {
  const params = { knowledgeId: input.knowledgeId, relativePath: input.relativePath };
  await _runCypher(UPSERT_FILE, {
    ...params,
    language: input.language,
    sha: input.sha,
    sizeBytes: input.sizeBytes,
    purpose: input.analysis.purpose,
    summary: input.analysis.summary,
    businessContext: input.analysis.businessContext,
    updatedAt: new Date().toISOString(),
  });

  await _runCypher(CLEAR_KEYWORDS, params);
  await _runCypher(CLEAR_CLASSES, params);
  await _runCypher(CLEAR_FUNCTIONS, params);
  await _runCypher(CLEAR_IMPORTS_INTERNAL, params);
  await _runCypher(CLEAR_IMPORTS_EXTERNAL, params);

  if (input.analysis.keywords.length > 0) {
    await _runCypher(ATTACH_KEYWORDS, { ...params, names: input.analysis.keywords.map((k) => k.toLowerCase()) });
  }
  if (input.analysis.classes.length > 0) {
    await _runCypher(ATTACH_CLASSES, { ...params, signatures: input.analysis.classes });
  }
  if (input.analysis.functions.length > 0) {
    await _runCypher(ATTACH_FUNCTIONS, { ...params, signatures: input.analysis.functions });
  }
  if (input.analysis.importsInternal.length > 0) {
    await _runCypher(ATTACH_IMPORTS_INTERNAL, { ...params, names: input.analysis.importsInternal });
  }
  if (input.analysis.importsExternal.length > 0) {
    await _runCypher(ATTACH_IMPORTS_EXTERNAL, { ...params, names: input.analysis.importsExternal });
  }
}
