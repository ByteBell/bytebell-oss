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
  repoUrl: string;
  branch?: string;
}

export interface LocalKnowledgeSource {
  kind: "local";
  sourcePath: string;
}

export type KnowledgeSource = GithubKnowledgeSource | LocalKnowledgeSource;

export interface KnowledgeDoc {
  knowledgeId: string;
  source: KnowledgeSource;
  status: { state: KnowledgeState; totalFiles?: number; processedFiles?: number };
  createdAt: Date;
  updatedAt: Date;
}
