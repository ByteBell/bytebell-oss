export enum KnowledgeState {
  Created = "CREATED",
  Queued = "QUEUED",
  Ingested = "INGESTED",
  Processing = "PROCESSING",
  Processed = "PROCESSED",
  Failed = "FAILED",
}

export interface CommitHashRecord {
  hash: string;
  inputTokens: string;
  outputTokens: string;
  /** Authoritative provider-reported cost in USD (OpenRouter `usage.cost`). "0" for Ollama or when omitted by provider. */
  costUsd: string;
}

export interface GithubKnowledgeSource {
  kind: "github";
  /** Current head pointer — the most recently indexed commit. */
  commitId?: string;
  /** Every commit this knowledge has been indexed at, oldest → newest. Pull appends to this list. */
  commitHashes?: (string | CommitHashRecord)[];
}

export interface LocalKnowledgeSource {
  kind: "local";
  sourcePath: string;
}

export type KnowledgeSource = GithubKnowledgeSource | LocalKnowledgeSource;

export interface KnowledgeInfo {
  repoUrl?: string;
  branch?: string;
  git_url?: string;
  githubInfo?: { commitId?: string; commitHashes?: string[]; branchName?: string };
  [key: string]: unknown;
}

/**
 * Categorises why a knowledge ingestion failed. Drives operator triage and
 * downstream UI hints.
 *
 * - `llm_config` — missing or empty API key (operator action required)
 * - `llm_auth` — 401/403 from provider, key invalid/expired (operator action)
 * - `llm_quota` — 402, credit/billing exhausted (operator action)
 * - `llm_rate_limit` — 429, transient — could be retried later by operator
 * - `llm_unreachable` — 5xx / network / timeout (transient infra issue)
 * - `cancelled` — operator-initiated cancellation
 * - `internal` — anything else (bug, infra, unexpected exception)
 */
export type KnowledgeFailureCategory =
  | "llm_config"
  | "llm_auth"
  | "llm_quota"
  | "llm_rate_limit"
  | "llm_unreachable"
  | "cancelled"
  | "internal";

export interface KnowledgeFailure {
  /** Short, operator-readable sentence. UI can render this directly. */
  reason: string;
  category: KnowledgeFailureCategory;
  at: Date;
  /** Raw provider response or structured detail for debugging. May be long. */
  detail?: string;
}

export interface KnowledgeDoc {
  knowledgeId: string;
  source: KnowledgeSource;
  status: { state: KnowledgeState; totalFiles?: number; processedFiles?: number };
  createdAt: Date;
  updatedAt: Date;
  info: KnowledgeInfo;
  /**
   * Populated when `status.state === KnowledgeState.Failed`. Cleared
   * automatically on the next successful transition out of FAILED.
   */
  failure?: KnowledgeFailure;
}
