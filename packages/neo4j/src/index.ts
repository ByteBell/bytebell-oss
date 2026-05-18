export { connectNeo4j, closeNeo4j, pingNeo4j } from "./client.ts";
export { _runCypher as runCypher, toNeo4jInt } from "./client.ts";
export type { PingResult } from "./client.ts";

export { ensureKnowledgeIndexes } from "./indexes.ts";
export { ensureFlatFolderIndexes } from "./flatFolderIndexes.ts";

export {
  upsertKnowledgeNode,
  setKnowledgeStateInGraph,
  setKnowledgeBranchInGraph,
  deleteKnowledgeGraph,
} from "./knowledge.ts";

export { upsertFileNode, deleteFileNodes } from "./files.ts";
export type { UpsertFileNodeInput } from "./files.ts";

export { upsertRepoNode } from "./repo.ts";
export type { NodeScope, RepoSummaryPayload, UpsertRepoNodeInput } from "./repo.ts";

export { upsertFolderNode } from "./folder.ts";
export type { FolderSummaryPayload, UpsertFolderNodeInput } from "./folder.ts";

export { snapshotFilesToVersion } from "./fileVersions.ts";
export type { SnapshotFilesInput } from "./fileVersions.ts";
