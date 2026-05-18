export { connectMongo, closeMongo, pingMongo } from "./client.ts";
export type { PingResult } from "./client.ts";

export {
  getKnowledge,
  setKnowledgeCommit,
  setKnowledgeState,
  markKnowledgeFailed,
  setKnowledgeBranch,
  updateKnowledgeProgress,
  upsertKnowledge,
  listKnowledge,
  deleteKnowledge,
} from "./knowledge.ts";
export type { KnowledgeListEntry, DeleteKnowledgeResult } from "./knowledge.ts";

export { upsertRawFile, listRawFileShas, deleteRawFiles } from "./raw.ts";
export type { FileAnalysis, FileAnalysisSection, RawFileDoc } from "./raw.ts";

export { aggregateStats } from "./aggregateStats.ts";

export { incrementUsage, getMonthlyUsage, getGlobalUsage } from "./usage.ts";
export { recordActivity } from "./activity.ts";
