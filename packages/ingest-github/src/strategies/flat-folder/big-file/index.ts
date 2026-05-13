import { createHash } from "node:crypto";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import { logger } from "@bb/logger";
import type { ChunkAnalysisResult, HugeFileManifest } from "src/types/big-file.ts";
import type { CondensedFileAnalysis } from "src/types/condensed-file-analysis.ts";
import type { MetaPaths } from "src/types/meta-paths.ts";
import { throwIfCancelled } from "src/pipeline/cancellation.ts";
import { splitFileIntoChunks } from "./chunker.ts";
import { analyzeChunk } from "./chunk-analyzer.ts";
import { condenseChunks } from "./condenser.ts";
import { loadChunkIfPresent, saveChunk, saveCondensed, saveManifest } from "./storage.ts";

export interface ProcessBigFileInput {
  knowledgeId: string;
  metaPaths: MetaPaths;
  relativePath: string;
  content: string;
  sizeBytes: number;
}

export async function processBigFile(input: ProcessBigFileInput): Promise<CondensedFileAnalysis> {
  throwIfCancelled(input.knowledgeId);
  const maxTokensPerChunk = getConfigValue(Config.MaxTokensPerChunk);
  const concurrency = getConfigValue(Config.BigFileConcurrency);
  const chunks = splitFileIntoChunks(input.relativePath, input.content, maxTokensPerChunk);
  logger.info(`processBigFile: ${input.relativePath} split into ${chunks.length} chunks`);

  const results: ChunkAnalysisResult[] = new Array(chunks.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < chunks.length) {
      const idx = nextIndex;
      nextIndex += 1;
      throwIfCancelled(input.knowledgeId);
      const chunk = chunks[idx];
      if (chunk === undefined) {
        continue;
      }
      const cached = await loadChunkIfPresent(input.metaPaths, input.relativePath, idx);
      if (cached !== null) {
        results[idx] = cached;
        continue;
      }
      const analyzed = await analyzeChunk(chunk);
      await saveChunk(input.metaPaths, analyzed);
      results[idx] = analyzed;
    }
  };

  const workerCount = Math.min(concurrency, chunks.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  throwIfCancelled(input.knowledgeId);
  const merged = await condenseChunks(input.relativePath, results);

  const chunkPaths = chunks.map((_, i) => `chunks/${encodeFolder(input.relativePath)}/chunk-${i}.json`);
  const totalTokenCount = chunks.reduce((acc, c) => acc + c.tokenCount, 0);
  const manifest: HugeFileManifest = {
    relativePath: input.relativePath,
    totalChunks: chunks.length,
    totalTokenCount,
    chunkPaths,
    generatedAt: new Date().toISOString(),
  };
  await saveManifest(input.metaPaths, manifest);

  const condensed: CondensedFileAnalysis = {
    relativePath: input.relativePath,
    language: merged.language,
    sha256: sha256(input.content),
    sizeBytes: input.sizeBytes,
    tokenCount: totalTokenCount,
    isBigFile: true,
    totalChunks: chunks.length,
    totalTokenCount,
    analysedAt: new Date().toISOString(),
    analysis: merged.analysis,
  };
  await saveCondensed(input.metaPaths, condensed);
  return condensed;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function encodeFolder(relativePath: string): string {
  return relativePath.replace(/\//gu, "__SL__").replace(/\\/gu, "__BS__");
}
