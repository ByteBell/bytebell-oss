import { _runCypher } from "./client.ts";

/**
 * Snapshots the current `:File` set for a knowledge into `:FileVersion` nodes
 * tagged with `commitHash`. Run **before** the strategy overwrites the `:File`
 * nodes during a pull, so the prior commit's state is preserved as a version
 * snapshot rather than being lost.
 *
 * Each `:FileVersion` carries the same descriptive props as the `:File` it
 * came from (purpose, summary, businessContext, language, sha, sizeBytes) and
 * a `:VERSION_OF` edge back to the live `:File`. Symbol/keyword/import edges
 * are not duplicated — they live on the live `:File` and rotate on overwrite.
 *
 * Idempotent: the unique constraint on `(:FileVersion {knowledgeId, relativePath, commitHash})`
 * causes re-snapshotting the same commit to be a no-op.
 */
const SNAPSHOT_FILES_TO_VERSION = `
MATCH (f:File {knowledgeId: $knowledgeId})
MERGE (fv:FileVersion {
  knowledgeId: $knowledgeId,
  relativePath: f.relativePath,
  commitHash: $commitHash
})
SET fv.language = f.language,
    fv.sha = f.sha,
    fv.sizeBytes = f.sizeBytes,
    fv.purpose = f.purpose,
    fv.summary = f.summary,
    fv.businessContext = f.businessContext,
    fv.snapshotAt = $snapshotAt
MERGE (f)-[:HAS_VERSION]->(fv)
`;

export interface SnapshotFilesInput {
  knowledgeId: string;
  /** The commit the current `:File` state corresponds to — i.e. the OLD commitId being archived. */
  commitHash: string;
}

/** Copies every live `:File` into a `:FileVersion(commitHash)` snapshot. */
export async function snapshotFilesToVersion(input: SnapshotFilesInput): Promise<void> {
  await _runCypher(SNAPSHOT_FILES_TO_VERSION, {
    knowledgeId: input.knowledgeId,
    commitHash: input.commitHash,
    snapshotAt: new Date().toISOString(),
  });
}
