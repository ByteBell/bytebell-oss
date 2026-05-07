export { connectMongo, closeMongo, pingMongo } from "./client.ts";
export type { PingResult } from "./client.ts";

export {
  getKnowledge,
  setKnowledgeState,
  updateKnowledgeProgress,
  upsertKnowledge,
  listKnowledge,
  deleteKnowledge,
} from "./knowledge.ts";
export type { KnowledgeListEntry, DeleteKnowledgeResult } from "./knowledge.ts";

export { upsertRawFile } from "./raw.ts";
export type { FileAnalysis, RawFileDoc } from "./raw.ts";

export { recordProcessingStats, aggregateStats } from "./processingStats.ts";
export type { RecordProcessingStatsInput } from "./processingStats.ts";

export { incrementUsage, getMonthlyUsage, getGlobalUsage } from "./usage.ts";
export { recordActivity } from "./activity.ts";
