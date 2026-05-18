import { askJsonLLM, type AskLlmOptions } from "@bb/llm";
import { logger } from "@bb/logger";
import type { ChunkAnalysisResult, FileChunk } from "#src/types/big-file.ts";
import { FALLBACK_LANGUAGE, emptyFileAnalysis } from "#src/types/file-analysis.ts";
import { shapeAnalysis } from "#src/adapters/llm-file-analyzer.ts";
import { CHUNK_ANALYSIS_SYSTEM_PROMPT, buildChunkUserPrompt } from "#src/strategies/flat-folder/prompts/chunk.ts";

export async function analyzeChunk(chunk: FileChunk, llmCallContext?: AskLlmOptions): Promise<ChunkAnalysisResult> {
  const systemPrompt = CHUNK_ANALYSIS_SYSTEM_PROMPT;
  const userPrompt = buildChunkUserPrompt({
    relativePath: chunk.relativePath,
    chunkIndex: chunk.chunkIndex,
    totalChunks: chunk.totalChunks,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    content: chunk.content,
  });
  try {
    const response = await askJsonLLM<Record<string, unknown>>(systemPrompt, userPrompt, llmCallContext ?? {});
    if (response.result === null) {
      logger.warn(
        `analyzeChunk: ${chunk.relativePath} chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} returned unparseable JSON`,
      );
      return emptyChunkResult(chunk);
    }
    const { language, analysis } = shapeAnalysis(response.result);
    return {
      relativePath: chunk.relativePath,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      language,
      analysis,
      tokenUsage: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens },
    };
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    logger.warn(
      `analyzeChunk: ${chunk.relativePath} chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} askJsonLLM failed: ${msg}`,
    );
    return emptyChunkResult(chunk);
  }
}

function emptyChunkResult(chunk: FileChunk): ChunkAnalysisResult {
  return {
    relativePath: chunk.relativePath,
    chunkIndex: chunk.chunkIndex,
    totalChunks: chunk.totalChunks,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    language: FALLBACK_LANGUAGE,
    analysis: emptyFileAnalysis(),
  };
}
