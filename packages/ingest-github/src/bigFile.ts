import { askLLM, type AskLlmUsage } from "@bb/llm";
import type { FileAnalysis } from "@bb/mongo";
import {
  CONDENSE_CONTEXT_LIMIT,
  CONDENSE_PROMPT_OVERHEAD,
  FALLBACK_LANGUAGE,
  FILE_ANALYSIS_FIELDS_BLOCK,
  MAX_TOKENS_PER_CHUNK,
  SMALL_FILE_DEDUP_THRESHOLD,
  emptyAnalysis,
  parseFileAnalysisJson,
  tokenLen,
  tryParse,
} from "./analysisShared.ts";

export interface AnalyzedFile {
  language: string;
  analysis: FileAnalysis;
  usage: AskLlmUsage | null;
}

interface ChunkResult {
  language: string;
  analysis: FileAnalysis;
}

interface UsageAccumulator {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
}

export async function analyzeBigFile(relativePath: string, content: string): Promise<AnalyzedFile> {
  const chunks = splitIntoChunks(content, MAX_TOKENS_PER_CHUNK);
  const usage: UsageAccumulator = { model: null, inputTokens: 0, outputTokens: 0 };
  const perChunk: ChunkResult[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const result = await analyzeChunk(relativePath, index, chunks.length, chunk, usage);
    perChunk.push(result);
  }

  const merged =
    perChunk.length <= SMALL_FILE_DEDUP_THRESHOLD
      ? dedupAnalyses(perChunk)
      : await condenseRecursively(relativePath, perChunk, 0, usage);

  return { language: merged.language, analysis: merged.analysis, usage: finalize(usage) };
}

function splitIntoChunks(content: string, maxTokensPerChunk: number): string[] {
  const lines = content.split("\n");
  const chunks: string[] = [];
  let buf: string[] = [];
  let bufTokens = 0;

  for (const line of lines) {
    const lineTokens = tokenLen(line + "\n");
    if (bufTokens + lineTokens > maxTokensPerChunk && buf.length > 0) {
      chunks.push(buf.join("\n"));
      buf = [];
      bufTokens = 0;
    }
    buf.push(line);
    bufTokens += lineTokens;
  }
  if (buf.length > 0) {
    chunks.push(buf.join("\n"));
  }
  return chunks;
}

async function analyzeChunk(
  relativePath: string,
  chunkIndex: number,
  totalChunks: number,
  chunkContent: string,
  usage: UsageAccumulator,
): Promise<ChunkResult> {
  const prompt = buildChunkPrompt(relativePath, chunkIndex, totalChunks, chunkContent);
  let raw: string;
  try {
    const result = await askLLM(prompt);
    raw = result.content;
    addUsage(usage, result.usage);
  } catch {
    return { language: FALLBACK_LANGUAGE, analysis: emptyAnalysis() };
  }
  const parsed = tryParse(raw);
  if (parsed === null) {
    return { language: FALLBACK_LANGUAGE, analysis: emptyAnalysis() };
  }
  return parseFileAnalysisJson(parsed);
}

async function condenseRecursively(
  relativePath: string,
  items: ChunkResult[],
  depth: number,
  usage: UsageAccumulator,
): Promise<ChunkResult> {
  const first = items[0];
  if (items.length === 1 && first !== undefined) {
    return first;
  }
  const prompt = buildCondensePrompt(relativePath, items);
  if (tokenLen(prompt) <= CONDENSE_CONTEXT_LIMIT) {
    return await condenseOne(prompt, items, usage);
  }
  const budget = Math.max(CONDENSE_CONTEXT_LIMIT - CONDENSE_PROMPT_OVERHEAD, 2_000);
  const batches = batchByTokenBudget(items, budget);
  const batchResults: ChunkResult[] = [];
  for (const batch of batches) {
    const batchPrompt = buildCondensePrompt(relativePath, batch);
    batchResults.push(await condenseOne(batchPrompt, batch, usage));
  }
  return await condenseRecursively(relativePath, batchResults, depth + 1, usage);
}

async function condenseOne(prompt: string, fallback: ChunkResult[], usage: UsageAccumulator): Promise<ChunkResult> {
  try {
    const result = await askLLM(prompt);
    addUsage(usage, result.usage);
    const parsed = tryParse(result.content);
    if (parsed !== null) {
      return parseFileAnalysisJson(parsed);
    }
  } catch {
    // fall through to dedup
  }
  return dedupAnalyses(fallback);
}

function batchByTokenBudget(items: ChunkResult[], budget: number): ChunkResult[][] {
  const batches: ChunkResult[][] = [];
  let current: ChunkResult[] = [];
  let currentTokens = 0;
  for (const item of items) {
    const itemTokens = tokenLen(serializeItem(item));
    if (currentTokens + itemTokens > budget && current.length > 0) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(item);
    currentTokens += itemTokens;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function dedupAnalyses(items: ChunkResult[]): ChunkResult {
  const language = items.find((i) => i.language !== FALLBACK_LANGUAGE)?.language ?? FALLBACK_LANGUAGE;
  const purposes = items.map((i) => i.analysis.purpose).filter((s) => s.length > 0);
  const summaries = items.map((i) => i.analysis.summary).filter((s) => s.length > 0);
  const contexts = items.map((i) => i.analysis.businessContext).filter((s) => s.length > 0);
  const classes = unique(items.flatMap((i) => i.analysis.classes));
  const functions = unique(items.flatMap((i) => i.analysis.functions));
  const importsInternal = unique(items.flatMap((i) => i.analysis.importsInternal));
  const importsExternal = unique(items.flatMap((i) => i.analysis.importsExternal));
  const keywords = unique(items.flatMap((i) => i.analysis.keywords)).slice(0, 10);
  return {
    language,
    analysis: {
      purpose: purposes.join(" | "),
      summary: summaries.join(" | "),
      businessContext: contexts.join(" "),
      classes,
      functions,
      importsInternal,
      importsExternal,
      keywords,
    },
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

function buildChunkPrompt(relativePath: string, chunkIndex: number, totalChunks: number, content: string): string {
  return `You are analyzing chunk ${chunkIndex + 1} of ${totalChunks} from a single source file for a code knowledge graph.
Focus on what exists in THIS CHUNK only. Do not infer content from other chunks.
Return ONLY a JSON object, no prose, no markdown fences, with EXACTLY these keys:

${FILE_ANALYSIS_FIELDS_BLOCK}

Do not invent line ranges — derive from the actual content.

File path: ${relativePath}
Chunk content:
${content}`;
}

const CONDENSE_MERGE_RULES = `## Merge rules (apply on top of the field definitions above)

- purpose          : merge into ONE cohesive 2-3 sentence description.
- summary          : ≤600 tokens, plain-English; cover what the file does, why it exists, and how it fits in the system.
- businessContext  : merge into ONE short paragraph (2-3 lines).
- language         : single canonical name; if items disagree, pick the value that appears most often; "unknown" if truly inconclusive.
- classes          : deduplicate. Keep ONLY exported / public / entry-point items. Drop private helpers and internal DTOs. Aggressively filter to stay under ~3000 tokens total. Preserve the "Name (~Lstart-end): description" format. Each entry MUST be a single class — never concatenate multiple into one string.
- functions        : deduplicate. Keep ONLY exported / public / entry-point items, API handlers, lifecycle methods. Drop private helpers and trivial getters/setters. Aggressively filter to stay under ~3000 tokens total. Preserve the "name (~Lstart-end): description" format. Each entry MUST be a single function — never concatenate multiple into one string.
- importsInternal  : deduplicate within the list. Keep significant relative imports.
- importsExternal  : deduplicate within the list. Drop stdlib and trivial utilities; keep significant frameworks and core packages.
- keywords         : deduplicate, keep the top 10 most representative.`;

function buildCondensePrompt(relativePath: string, items: ChunkResult[]): string {
  const serialized = items.map((item, i) => `--- Item ${i + 1} ---\n${serializeItem(item)}`).join("\n\n");
  return `You are condensing ${items.length} partial analyses of a single file \`${relativePath}\` into ONE coherent file-level analysis.
Return ONLY a JSON object, no prose, no markdown fences, with EXACTLY the same keys as each input item.

## Field definitions (see these for the meaning of each field)

${FILE_ANALYSIS_FIELDS_BLOCK}

${CONDENSE_MERGE_RULES}

INPUT (${items.length} partial analyses):

${serialized}`;
}

function serializeItem(item: ChunkResult): string {
  const a = item.analysis;
  return [
    `language: ${item.language}`,
    `purpose: ${a.purpose}`,
    `summary: ${a.summary}`,
    `businessContext: ${a.businessContext}`,
    `classes (${a.classes.length}): ${JSON.stringify(a.classes)}`,
    `functions (${a.functions.length}): ${JSON.stringify(a.functions)}`,
    `importsInternal (${a.importsInternal.length}): ${JSON.stringify(a.importsInternal)}`,
    `importsExternal (${a.importsExternal.length}): ${JSON.stringify(a.importsExternal)}`,
    `keywords (${a.keywords.length}): ${JSON.stringify(a.keywords)}`,
  ].join("\n");
}

function addUsage(acc: UsageAccumulator, usage: AskLlmUsage): void {
  if (acc.model === null) {
    acc.model = usage.model;
  }
  acc.inputTokens += usage.inputTokens;
  acc.outputTokens += usage.outputTokens;
}

function finalize(acc: UsageAccumulator): AskLlmUsage | null {
  if (acc.model === null) {
    return null;
  }
  return { model: acc.model, inputTokens: acc.inputTokens, outputTokens: acc.outputTokens };
}
