/**
 * The structured analysis produced by LLM from user-authored business-context text.
 * Two audiences are served by one document: product people (title, user stories,
 * stakeholders, business value) and engineers (technical summary, affected modules,
 * architecture decisions, dependencies, data flow).
 */
export interface BusinessContextAnalysis {
  // Product fields
  title: string;
  product_area: string;
  user_stories: string[];
  business_value: string;
  stakeholders: string[];
  success_metrics: string[];
  user_impact: string;
  domain_keywords: string[];

  // Technical fields
  technical_summary: string;
  affected_modules: string[];
  architecture_decisions: string[];
  dependencies: string[];
  risk_areas: string[];
  data_flow: string;
  api_surface: string[];

  // Shared fields
  summary: string;
  keywords: string[];
}

/**
 * Input to the BusinessContext strategy. `orgId` is single-tenant (`"local"`) in
 * OSS; downstream multi-tenant deployments stamp it from the request.
 */
export interface BusinessContextInput {
  /** Raw business-context text authored by a human. */
  text: string;
  /** Knowledge entity UUID. */
  knowledgeId: string;
  /** 40-char hex SHA. Must reference an indexed commit. */
  commitHash: string;
  /** Tenant binding. */
  orgId: string;
  /** Optional human-supplied description, persisted alongside the analysis envelope. */
  description?: string;
}

/** Result of the disk-side pipeline (validation → enrichment → LLM → write). */
export interface BusinessContextStorageResult {
  /** Absolute path to the saved `analysis.json`. */
  analysisPath: string;
  /** Absolute path to the saved `original.txt`. */
  originalTextPath: string;
  /** The LLM-generated title. */
  title: string;
  /** The commit hash the analysis is anchored to. */
  commitHash: string;
  /** Sanitized title used as the node_id and the on-disk directory name. */
  sanitizedTitle: string;
}

/** Result returned after persisting to Neo4j. */
export interface BusinessContextNeo4jResult {
  /** Whether the main `:BusinessContext` node was created (true on first run, true on MERGE). */
  businessContextNodeCreated: boolean;
  /** Whether the per-commit `:BusinessContextVersion` was created or merged. */
  versionNodeCreated: boolean;
  /** Total number of `:OrgKeyword` relationships created. */
  keywordRelationships: number;
  /** Count of `[:DESCRIBES]` edges from the version node to file-version nodes for this commit. */
  fileVersionRelationships: number;
}

/** Metadata envelope wrapping the analysis when persisted to disk. */
export interface BusinessContextAnalysisMetadata {
  /** ISO timestamp of when the analysis was generated. */
  generatedAt: string;
  /** The commit hash this analysis is stored under. */
  commitHash: string;
  /** LLM model name used. */
  modelName: string;
  /** Total input tokens consumed (title + analysis calls combined). */
  inputTokens: number;
  /** Total output tokens consumed (title + analysis calls combined). */
  outputTokens: number;
  /** Optional human-supplied description carried through from the input. */
  description?: string;
  /** The full analysis object. */
  analysis: BusinessContextAnalysis;
}

/** Result of the title-generation LLM call. */
export interface TitleGenerationResult {
  title: string;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
}

/** Result of the parallel analysis LLM calls. */
export interface AnalysisResult {
  analysis: BusinessContextAnalysis | null;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
}

/** Options forwarded to the LLM layer (per-job credential overrides, etc.). */
export interface BusinessContextLlmOptions {
  /** Optional per-job LLM API key override. */
  apiKey?: string;
  /** Optional per-job LLM provider override (`"openrouter"` or `"ollama"` in OSS). */
  provider?: string;
  /** Optional per-job LLM model override. */
  model?: string;
}
