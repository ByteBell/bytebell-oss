import path from "node:path";
import type { KnowledgeDoc, KnowledgeSource, KnowledgeState } from "@bb/types";
import { _runCypher } from "./client.ts";

const UPSERT_KNOWLEDGE = `
MERGE (k:Knowledge {knowledgeId: $knowledgeId})
ON CREATE SET k.createdAt = $createdAt
SET k.sourceKind = $sourceKind,
    k.sourceUrl = $sourceUrl,
    k.branch = $branch,
    k.repoName = $repoName,
    k.state = $state,
    k.updatedAt = $updatedAt
`;

const SET_STATE = `
MATCH (k:Knowledge {knowledgeId: $knowledgeId})
SET k.state = $state, k.updatedAt = $updatedAt
`;

const DELETE_FILES_BY_KNOWLEDGE = `
MATCH (f:File {knowledgeId: $knowledgeId})
DETACH DELETE f
`;

const DELETE_KNOWLEDGE_NODE = `
MATCH (k:Knowledge {knowledgeId: $knowledgeId})
DETACH DELETE k
`;

export async function upsertKnowledgeNode(doc: KnowledgeDoc): Promise<void> {
  const sourceKind = doc.source.kind;
  const sourceUrl = doc.source.kind === "github" ? doc.source.repoUrl : doc.source.sourcePath;
  const branch = doc.source.kind === "github" ? (doc.source.branch ?? null) : null;
  await _runCypher(UPSERT_KNOWLEDGE, {
    knowledgeId: doc.knowledgeId,
    sourceKind,
    sourceUrl,
    branch,
    repoName: deriveRepoName(doc.source),
    state: doc.status.state,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}

export async function setKnowledgeStateInGraph(knowledgeId: string, state: KnowledgeState): Promise<void> {
  await _runCypher(SET_STATE, {
    knowledgeId,
    state,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteKnowledgeGraph(knowledgeId: string): Promise<void> {
  await _runCypher(DELETE_FILES_BY_KNOWLEDGE, { knowledgeId });
  await _runCypher(DELETE_KNOWLEDGE_NODE, { knowledgeId });
}

function deriveRepoName(source: KnowledgeSource): string {
  if (source.kind === "local") {
    return path.basename(source.sourcePath);
  }
  return repoNameFromGithubUrl(source.repoUrl);
}

function repoNameFromGithubUrl(repoUrl: string): string {
  let pathname: string;
  try {
    pathname = new URL(repoUrl).pathname;
  } catch {
    pathname = repoUrl;
  }
  const segments = pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const repo = segments.at(-1);
  const owner = segments.at(-2);
  if (owner === undefined || repo === undefined) {
    return repoUrl;
  }
  return `${owner}/${repo.replace(/\.git$/u, "")}`;
}
