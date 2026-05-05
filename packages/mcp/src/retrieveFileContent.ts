import { prefixWithLineNumbers, readFileLines, sliceLines } from "./repoFs.ts";

const DEFAULT_TO_LINE = Number.MAX_SAFE_INTEGER;
const DEFAULT_MAX_TOKENS = 10_000;
const APPROX_CHARS_PER_TOKEN = 4;
const DEFAULT_CONTEXT_LINES = 3;
const MAX_CONTEXT_LINES = 10;

export interface ContentOptions {
  knowledgeId: string;
  relativePath: string;
  fromLine?: number;
  toLine?: number;
  maxTokens?: number;
  search?: string;
  contextLines?: number;
}

export interface ContentMatch {
  line: number;
  text: string;
  context: string;
}

export interface ContentRangeResult {
  operation: "content";
  knowledgeId: string;
  relativePath: string;
  totalLines: number;
  fromLine: number;
  toLine: number;
  truncated: boolean;
  hasMore: boolean;
  nextFromLine?: number;
  content: string;
}

export interface ContentSearchResult {
  operation: "content_search";
  knowledgeId: string;
  relativePath: string;
  totalLines: number;
  search: string;
  searchMatches: number;
  matches: ContentMatch[];
}

export type ContentResult = ContentRangeResult | ContentSearchResult;

export async function readFileRange(opts: ContentOptions): Promise<ContentResult> {
  const lines = await readFileLines(opts.knowledgeId, opts.relativePath);
  if (typeof opts.search === "string" && opts.search.length > 0) {
    return runSearchWithinFile(opts, lines, opts.search);
  }
  return runRangeRead(opts, lines);
}

function runRangeRead(opts: ContentOptions, lines: string[]): ContentRangeResult {
  const totalLines = lines.length;
  const fromLine = Math.max(1, opts.fromLine ?? 1);
  const requestedTo = opts.toLine ?? DEFAULT_TO_LINE;
  const toLineRequested = Math.max(fromLine, Math.min(totalLines, requestedTo));
  const sliced = sliceLines(lines, { fromLine, toLine: toLineRequested });
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const charBudget = maxTokens * APPROX_CHARS_PER_TOKEN;
  const trimmed = trimByBudget(sliced, fromLine, charBudget);
  const renderedText = prefixWithLineNumbers(trimmed.lines, fromLine);
  const actualTo = fromLine + trimmed.lines.length - 1;
  const truncated = trimmed.truncated || actualTo < toLineRequested;
  const hasMore = actualTo < totalLines;
  return {
    operation: "content",
    knowledgeId: opts.knowledgeId,
    relativePath: opts.relativePath,
    totalLines,
    fromLine,
    toLine: actualTo,
    truncated,
    hasMore,
    ...(hasMore ? { nextFromLine: actualTo + 1 } : {}),
    content: renderedText,
  };
}

function trimByBudget(
  lines: readonly string[],
  startLine: number,
  charBudget: number,
): { lines: string[]; truncated: boolean } {
  const out: string[] = [];
  let used = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const candidate = lines[i] ?? "";
    const cost = String(startLine + i).length + 3 + candidate.length;
    if (used + cost > charBudget && out.length > 0) {
      return { lines: out, truncated: true };
    }
    out.push(candidate);
    used += cost;
  }
  return { lines: out, truncated: false };
}

function runSearchWithinFile(opts: ContentOptions, lines: readonly string[], rawTerm: string): ContentSearchResult {
  const term = rawTerm.toLowerCase();
  const contextLines = clampContext(opts.contextLines);
  const matches: ContentMatch[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.toLowerCase().includes(term)) {
      continue;
    }
    const lineNumber = i + 1;
    const start = Math.max(0, i - contextLines);
    const end = Math.min(lines.length, i + contextLines + 1);
    const window = lines.slice(start, end);
    matches.push({
      line: lineNumber,
      text: line,
      context: prefixWithLineNumbers(window, start + 1),
    });
  }
  return {
    operation: "content_search",
    knowledgeId: opts.knowledgeId,
    relativePath: opts.relativePath,
    totalLines: lines.length,
    search: rawTerm,
    searchMatches: matches.length,
    matches,
  };
}

function clampContext(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_CONTEXT_LINES;
  }
  if (value < 0) {
    return 0;
  }
  if (value > MAX_CONTEXT_LINES) {
    return MAX_CONTEXT_LINES;
  }
  return Math.floor(value);
}
