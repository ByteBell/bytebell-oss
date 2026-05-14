export enum KnowledgeState {
  Created = "CREATED",
  Queued = "QUEUED",
  Ingested = "INGESTED",
  Processing = "PROCESSING",
  Processed = "PROCESSED",
  Failed = "FAILED",
}

export interface GithubKnowledgeSource {
  kind: "github";
  /** Current head pointer — the most recently indexed commit. */
  commitId?: string;
  /** Every commit this knowledge has been indexed at, oldest → newest. Pull appends to this list. */
  commitHashes?: string[];
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

export interface KnowledgeDoc {
  knowledgeId: string;
  source: KnowledgeSource;
  status: { state: KnowledgeState; totalFiles?: number; processedFiles?: number };
  createdAt: Date;
  updatedAt: Date;
  info: KnowledgeInfo;
}
