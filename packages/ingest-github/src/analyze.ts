import { askLLM, type AskLlmUsage } from "@bb/llm";
import type { FileAnalysis } from "@bb/mongo";
import {
  BIG_FILE_TOKEN_THRESHOLD,
  FALLBACK_LANGUAGE,
  FILE_ANALYSIS_FIELDS_BLOCK,
  emptyAnalysis,
  parseFileAnalysisJson,
  tokenLen,
  tryParse,
} from "./analysisShared.ts";
import { analyzeBigFile } from "./bigFile.ts";

export interface AnalyzedFile {
  language: string;
  analysis: FileAnalysis;
  usage: AskLlmUsage | null;
}

export async function analyzeFile(relativePath: string, content: string): Promise<AnalyzedFile> {
  if (tokenLen(content) > BIG_FILE_TOKEN_THRESHOLD) {
    return await analyzeBigFile(relativePath, content);
  }

  const prompt = buildPrompt(relativePath, content);
  let raw: string;
  let usage: AskLlmUsage;
  try {
    const result = await askLLM(prompt);
    raw = result.content;
    usage = result.usage;
  } catch {
    return { language: FALLBACK_LANGUAGE, analysis: emptyAnalysis(), usage: null };
  }

  const parsed = tryParse(raw);
  if (parsed === null) {
    return { language: FALLBACK_LANGUAGE, analysis: emptyAnalysis(), usage };
  }

  const { language, analysis } = parseFileAnalysisJson(parsed);
  return { language, analysis, usage };
}

function buildPrompt(relativePath: string, content: string): string {
  return `You are analyzing a single source file for a code knowledge graph.
Return ONLY a JSON object, no prose, no markdown fences, with EXACTLY these keys:

${FILE_ANALYSIS_FIELDS_BLOCK}

Do not invent line ranges — derive from the actual content.

File path: ${relativePath}
File content:
${content}`;
}
