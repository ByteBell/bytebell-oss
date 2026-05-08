import type { ModelTokenBreakdown } from "@bb/types";

export interface IngestionContext {
  knowledgeId: string;
  rootDir: string;
  /**
   * `relativePath → sha` map of the previously-indexed tree. When supplied,
   * the strategy diffs each scanned file's content sha against this map and
   * only analyses paths whose sha differs (or is absent). Omit for full
   * re-index — the initial `bytebell index` path takes this branch.
   */
  priorShas?: Map<string, string>;
}

export interface IngestionResult {
  /** Files whose analysis ran (added or modified). */
  filesAnalyzed: number;
  /** Files whose sha matched the prior tree and were skipped. */
  filesSkipped: number;
  /** Every relative path the scanner yielded — used to compute deletions. */
  seenPaths: Set<string>;
  modelTokens: ModelTokenBreakdown;
}

export interface IngestionStrategy {
  readonly name: string;
  ingest(ctx: IngestionContext): Promise<IngestionResult>;
}
