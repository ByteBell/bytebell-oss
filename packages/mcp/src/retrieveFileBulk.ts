import { prefixWithLineNumbers, readFileLines } from "./repoFs.ts";

const DEFAULT_CONTEXT_LINES = 3;
const MAX_CONTEXT_LINES = 10;

export interface BulkSearchOptions {
  knowledgeId: string;
  paths: readonly string[];
  search: string;
  contextLines?: number;
  matchOnly?: boolean;
}

export interface BulkMatchedHit {
  line: number;
  context: string;
}

export interface BulkMatchedFile {
  path: string;
  matchCount: number;
  matches?: BulkMatchedHit[];
}

export interface BulkSearchResult {
  operation: "bulk_search";
  knowledgeId: string;
  search: string;
  totalFilesScanned: number;
  totalMatches: number;
  matched: BulkMatchedFile[];
  noMatch: string[];
  errored: { path: string; error: string }[];
}

export async function bulkSearch(opts: BulkSearchOptions): Promise<BulkSearchResult> {
  const term = opts.search.toLowerCase();
  const contextLines = clampContext(opts.contextLines);
  const matchOnly = opts.matchOnly === true;

  const scans = opts.paths.map(async (relativePath): Promise<ScanOutcome> => {
    try {
      const lines = await readFileLines(opts.knowledgeId, relativePath);
      const hits = scanLines(lines, term, contextLines, matchOnly);
      return { kind: "ok", path: relativePath, hits };
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return { kind: "error", path: relativePath, error: message };
    }
  });

  const outcomes = await Promise.all(scans);
  const matched: BulkMatchedFile[] = [];
  const noMatch: string[] = [];
  const errored: { path: string; error: string }[] = [];
  let totalMatches = 0;

  for (const outcome of outcomes) {
    if (outcome.kind === "error") {
      errored.push({ path: outcome.path, error: outcome.error });
      continue;
    }
    if (outcome.hits.length === 0) {
      noMatch.push(outcome.path);
      continue;
    }
    totalMatches += outcome.hits.length;
    const file: BulkMatchedFile = { path: outcome.path, matchCount: outcome.hits.length };
    if (!matchOnly) {
      file.matches = outcome.hits;
    }
    matched.push(file);
  }

  matched.sort((a, b) => b.matchCount - a.matchCount);

  return {
    operation: "bulk_search",
    knowledgeId: opts.knowledgeId,
    search: opts.search,
    totalFilesScanned: opts.paths.length,
    totalMatches,
    matched,
    noMatch,
    errored,
  };
}

interface ScanOk {
  kind: "ok";
  path: string;
  hits: BulkMatchedHit[];
}

interface ScanErr {
  kind: "error";
  path: string;
  error: string;
}

type ScanOutcome = ScanOk | ScanErr;

function scanLines(
  lines: readonly string[],
  termLower: string,
  contextLines: number,
  matchOnly: boolean,
): BulkMatchedHit[] {
  const out: BulkMatchedHit[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.toLowerCase().includes(termLower)) {
      continue;
    }
    const lineNumber = i + 1;
    if (matchOnly) {
      out.push({ line: lineNumber, context: "" });
      continue;
    }
    const start = Math.max(0, i - contextLines);
    const end = Math.min(lines.length, i + contextLines + 1);
    const window = lines.slice(start, end);
    out.push({ line: lineNumber, context: prefixWithLineNumbers(window, start + 1) });
  }
  return out;
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
