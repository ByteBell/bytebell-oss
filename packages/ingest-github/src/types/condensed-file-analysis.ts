import type { FileAnalysis } from "@bb/mongo";

export interface CondensedFileAnalysis {
  relativePath: string;
  language: string;
  sha256: string;
  sizeBytes: number;
  tokenCount: number;
  isBigFile: boolean;
  totalChunks: number;
  totalTokenCount: number;
  analysedAt: string;
  analysis: FileAnalysis;
  tokenUsage?: { inputTokens: number; outputTokens: number; costUsd: number } | undefined;
}
