import { createHash } from "node:crypto";
import type { ModelTokenBreakdown } from "@bb/types";
import { upsertRawFile } from "@bb/mongo";
import { upsertFileNode } from "@bb/neo4j";
import { walkRepo } from "./scan.ts";
import { analyzeFile } from "./analyze.ts";
import type { IngestionContext, IngestionResult, IngestionStrategy } from "./Strategy.ts";

export class BasicFileAnalysisStrategy implements IngestionStrategy {
  readonly name = "basic-file-analysis";

  async ingest({ knowledgeId, rootDir }: IngestionContext): Promise<IngestionResult> {
    const modelTokens: ModelTokenBreakdown = {};
    let filesAnalyzed = 0;
    for await (const file of walkRepo(rootDir)) {
      const { language, analysis, usage } = await analyzeFile(file.relativePath, file.content);
      const sha = sha256(file.content);
      await upsertRawFile({
        knowledgeId,
        relativePath: file.relativePath,
        content: file.content,
        sha,
        sizeBytes: file.sizeBytes,
        language,
        analysis,
      });
      await upsertFileNode({
        knowledgeId,
        relativePath: file.relativePath,
        language,
        sha,
        sizeBytes: file.sizeBytes,
        analysis,
      });
      if (usage !== null) {
        accumulate(modelTokens, usage.model, usage.inputTokens, usage.outputTokens);
        filesAnalyzed += 1;
      }
    }
    return { filesAnalyzed, modelTokens };
  }
}

function accumulate(totals: ModelTokenBreakdown, model: string, inputTokens: number, outputTokens: number): void {
  const existing = totals[model];
  if (existing === undefined) {
    totals[model] = { inputTokens, outputTokens };
    return;
  }
  existing.inputTokens += inputTokens;
  existing.outputTokens += outputTokens;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
