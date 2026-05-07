import { askLLM, type AskLlmUsage } from "@bb/llm";
import type { FileAnalysis } from "@bb/mongo";
import {
  BIG_FILE_TOKEN_THRESHOLD,
  FALLBACK_LANGUAGE,
  emptyAnalysis,
  estimateTokens,
  parseFileAnalysisJson,
  tryParse,
} from "./analysisShared.ts";
import { analyzeBigFile } from "./bigFile.ts";

export interface AnalyzedFile {
  language: string;
  analysis: FileAnalysis;
  usage: AskLlmUsage | null;
}

export async function analyzeFile(relativePath: string, content: string): Promise<AnalyzedFile> {
  if (estimateTokens(content) > BIG_FILE_TOKEN_THRESHOLD) {
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

- purpose         : string  — <= 30 words, why this file exists
- summary         : string  — <= 80 words, plain-English description of contents
- businessContext : string  — 2-3 lines of business/product framing for the engineer reading this file. Why does this exist in the product? What domain or workflow does it serve? Empty string if you cannot infer it from the file alone.
- language        : string  — lowercase canonical name of any programming, markup, config, or data language identifiable from the contents (e.g. typescript, python, go, dockerfile, markdown, terraform, graphql). Return "unknown" if you cannot identify the language with confidence — do not guess generic labels like "text" or "plain".
- classes         : string[] — each item: "ClassName (~Lstart-end): one-line responsibility". Empty array if none.
- functions       : string[] — each item: "func_name (~Lstart-end): one-line responsibility". Top-level only; do not list methods of classes already listed above. Empty array if none.
- imports         : string[] — module identifiers as written in source (e.g. "express", "./routes/users", "node:fs/promises"). Empty array if none.
- keywords        : string[] — up to 10 technical/domain keywords. Lowercase, no generic words like "code" or "file".

Do not invent line ranges — derive from the actual content.

File path: ${relativePath}
File content:
${content}`;
}
