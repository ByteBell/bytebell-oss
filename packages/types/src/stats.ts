export interface ModelTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ModelTokenBreakdown = Record<string, ModelTokenUsage>;

export interface ProcessingStatsDoc {
  knowledgeId: string;
  repoName: string;
  commitHash: string;
  modelTokens: ModelTokenBreakdown;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  totalBatches: number;
  totalFiles: number;
  totalFolders: number;
  filesAnalyzed: number;
  processingTimeMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatsTotals {
  totalRepos: number;
  totalFiles: number;
  totalFolders: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: number;
}

export interface StatsRepoEntry {
  knowledgeId: string;
  repoName: string;
  type: "GITHUB" | "LOCAL";
  fileCount: number;
  folderCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface StatsCommitEntry {
  knowledgeId: string;
  repoName: string;
  commitHash: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  totalBatches: number;
  processingTimeMs: number;
  totalFiles: number;
  totalFolders: number;
  filesAnalyzed: number;
  createdAt: string;
  updatedAt: string;
}

export interface StatsResponse {
  totals: StatsTotals;
  repos: StatsRepoEntry[];
  commitStats: StatsCommitEntry[];
}
