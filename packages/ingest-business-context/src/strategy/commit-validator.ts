import { runCypher } from "@bb/neo4j";
import { CommitNotIndexedError } from "#src/errors.ts";

const CHECK_INDEXED = `
OPTIONAL MATCH (fv:FileVersion {knowledgeId: $knowledgeId, commitHash: $commitHash})
WITH count(fv) AS versionCount
OPTIONAL MATCH (f:File {knowledgeId: $knowledgeId})
WITH versionCount, count(f) AS fileCount
RETURN versionCount AS versions, fileCount AS files
`;

export interface CommitIndexStatus {
  /** Number of `:FileVersion` rows matching `(knowledgeId, commitHash)`. */
  fileVersions: number;
  /** Number of `:File` rows for the knowledge (any commit). */
  liveFiles: number;
  /** True if either count is positive. */
  indexed: boolean;
}

/**
 * Reports whether the commit's files are indexed. Two evidence sources:
 *
 *   1. `:FileVersion {knowledgeId, commitHash}` — historical snapshot exists.
 *   2. `:File {knowledgeId}` — live state exists, which implies the knowledge
 *      was indexed at *some* commit. We accept this because the latest commit
 *      may not yet have a snapshot (snapshots are taken before the next pull).
 *
 * If both are zero, the commit (or knowledge) is not indexed.
 */
export async function checkCommitIndexed(knowledgeId: string, commitHash: string): Promise<CommitIndexStatus> {
  const rows = await runCypher<{ versions: number; files: number }>(CHECK_INDEXED, { knowledgeId, commitHash });
  const row = rows[0] ?? { versions: 0, files: 0 };
  const fileVersions = Number(row.versions ?? 0);
  const liveFiles = Number(row.files ?? 0);
  return { fileVersions, liveFiles, indexed: fileVersions > 0 || liveFiles > 0 };
}

/** Throws `CommitNotIndexedError` if neither file-versions nor live files exist. */
export async function assertCommitIndexed(knowledgeId: string, commitHash: string): Promise<CommitIndexStatus> {
  const status = await checkCommitIndexed(knowledgeId, commitHash);
  if (!status.indexed) {
    throw new CommitNotIndexedError(knowledgeId, commitHash);
  }
  return status;
}
