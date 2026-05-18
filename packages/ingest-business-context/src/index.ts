// Public API for @bb/ingest-business-context.

export { registerBusinessContextWorker } from "./worker/register.ts";
export { handleBusinessContextProcessing } from "./worker/handler.ts";

export { executeBusinessContextStrategy } from "./strategy/execute.ts";
export type { ExecuteOptions } from "./strategy/execute.ts";
export { storeBusinessContextToNeo4j } from "./strategy/store-graph.ts";
export type { StoreGraphInput } from "./strategy/store-graph.ts";
export { assertCommitIndexed, checkCommitIndexed } from "./strategy/commit-validator.ts";
export type { CommitIndexStatus } from "./strategy/commit-validator.ts";

export { BUSINESS_CONTEXT_FIELD_DEFS, LLM_FIELD_NAMES, LLM_FIELD_NAME_SET } from "./field-defs.ts";
export type { BusinessContextFieldDef } from "./field-defs.ts";

export { BUSINESS_CONTEXT_KEYWORD_TYPES } from "./neo4j/relationship-types.ts";
export { ensureBusinessContextIndexes } from "./neo4j/indexes.ts";

export { sanitizeTitle } from "./disk/sanitize-title.ts";
export { loadCachedAnalysis } from "./disk/load-cached.ts";

export { CommitNotIndexedError, BusinessContextAnalysisFailedError } from "./errors.ts";

export type {
  BusinessContextAnalysis,
  BusinessContextAnalysisMetadata,
  BusinessContextInput,
  BusinessContextLlmOptions,
  BusinessContextNeo4jResult,
  BusinessContextStorageResult,
  TitleGenerationResult,
  AnalysisResult,
} from "./types.ts";
