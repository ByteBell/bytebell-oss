export { connectNeo4j, closeNeo4j, pingNeo4j } from "./client.ts";
export { _runCypher as runCypher, toNeo4jInt } from "./client.ts";
export type { PingResult } from "./client.ts";

export { ensureKnowledgeIndexes } from "./indexes.ts";

export { upsertKnowledgeNode, setKnowledgeStateInGraph, deleteKnowledgeGraph } from "./knowledge.ts";

export { upsertFileNode, deleteFileNodes } from "./files.ts";
export type { UpsertFileNodeInput } from "./files.ts";

export { snapshotFilesToVersion } from "./fileVersions.ts";
export type { SnapshotFilesInput } from "./fileVersions.ts";
