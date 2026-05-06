import type { ModelTokenBreakdown } from "@bb/types";

export interface IngestionContext {
  knowledgeId: string;
  rootDir: string;
}

export interface IngestionResult {
  filesAnalyzed: number;
  modelTokens: ModelTokenBreakdown;
}

export interface IngestionStrategy {
  readonly name: string;
  ingest(ctx: IngestionContext): Promise<IngestionResult>;
}
