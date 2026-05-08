import { createHash } from "node:crypto";
import type { ModelTokenBreakdown } from "@bb/types";
import { updateKnowledgeProgress, upsertRawFile } from "@bb/mongo";
import { upsertFileNode } from "@bb/neo4j";
import { countFiles, walkRepo, type ScannedFile } from "./scan.ts";
import { analyzeFile } from "./analyze.ts";
import type { IngestionContext, IngestionResult, IngestionStrategy } from "./Strategy.ts";

export class BasicFileAnalysisStrategy implements IngestionStrategy {
  readonly name = "basic-file-analysis";

  async ingest({ knowledgeId, rootDir, priorShas }: IngestionContext): Promise<IngestionResult> {
    const seenPaths = new Set<string>();
    const modelTokens: ModelTokenBreakdown = {};

    if (priorShas === undefined) {
      const totalFiles = await countFiles(rootDir);
      await updateKnowledgeProgress(knowledgeId, 0, totalFiles);
      let filesAnalyzed = 0;
      for await (const file of walkRepo(rootDir)) {
        seenPaths.add(file.relativePath);
        await this.analyzeAndPersist(knowledgeId, file, modelTokens);
        filesAnalyzed += 1;
        await updateKnowledgeProgress(knowledgeId, filesAnalyzed);
      }
      return { filesAnalyzed, filesSkipped: 0, seenPaths, modelTokens };
    }

    // Diff mode: walk once, hash each file, eagerly skip those whose sha
    // matches `priorShas`. Buffer the changed subset so the progress bar
    // can denominate against the actual workload, not the full repo.
    const changed: Array<{ file: ScannedFile; sha: string }> = [];
    let filesSkipped = 0;
    for await (const file of walkRepo(rootDir)) {
      seenPaths.add(file.relativePath);
      const sha = sha256(file.content);
      if (priorShas.get(file.relativePath) === sha) {
        filesSkipped += 1;
        continue;
      }
      changed.push({ file, sha });
    }

    await updateKnowledgeProgress(knowledgeId, 0, changed.length);
    let filesAnalyzed = 0;
    for (const { file, sha } of changed) {
      await this.analyzeAndPersist(knowledgeId, file, modelTokens, sha);
      filesAnalyzed += 1;
      await updateKnowledgeProgress(knowledgeId, filesAnalyzed);
    }
    return { filesAnalyzed, filesSkipped, seenPaths, modelTokens };
  }

  private async analyzeAndPersist(
    knowledgeId: string,
    file: ScannedFile,
    modelTokens: ModelTokenBreakdown,
    precomputedSha?: string,
  ): Promise<void> {
    const { language, analysis, usage } = await analyzeFile(file.relativePath, file.content);
    const sha = precomputedSha ?? sha256(file.content);
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
    }
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
