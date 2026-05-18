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
