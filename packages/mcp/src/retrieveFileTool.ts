import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchMetadata, type MetadataResult } from "./retrieveFileMetadata.ts";
import { readFileRange, type ContentResult } from "./retrieveFileContent.ts";
import { bulkSearch, type BulkSearchResult } from "./retrieveFileBulk.ts";

const OPERATIONS = ["metadata", "content", "bulk_search"] as const;

const MAX_METADATA_PATHS = 10;
const MAX_BULK_PATHS = 50;
const MIN_TOKENS = 1000;
const MAX_TOKENS = 50_000;
const MAX_CONTEXT_LINES = 10;

const description = `Retrieve file information and content from the local clone at ~/.bytebell/repos/{knowledgeId}.

OPERATIONS:

1. metadata — full FileNode info for up to ${MAX_METADATA_PATHS} files
   - relativePaths: required (array, max ${MAX_METADATA_PATHS})
   - returns purpose, summary, businessContext, classes[], functions[], importsInternal[], importsExternal[], keywords[], language, sizeBytes
   - ALWAYS call metadata first before fetching content. Class/Function signatures embed approximate line ranges (e.g. "AuthService (~L12-58): ...") — use them to target content reads.

2. content — read a line range or search within a single file
   - relativePath: required (single string)
   - fromLine / toLine: 1-based inclusive line range (omit toLine for "to end")
   - maxTokens: response cap (default 10000)
   - search: when set, returns ONLY lines containing this string + contextLines of surrounding context
   - contextLines: lines of context around each search match (default 3, max ${MAX_CONTEXT_LINES})

3. bulk_search — parallel scan of multiple files for a string (one round-trip instead of N sequential reads)
   - paths: required (array, max ${MAX_BULK_PATHS})
   - search: required
   - contextLines: lines of context around each match (default 3, max ${MAX_CONTEXT_LINES})
   - matchOnly: when true, return only line numbers without context (fast existence check)
   - returns matched[] (path + matchCount + matches[]) and noMatch[] (definitive absence list)`;

const schema = {
  operation: z.enum(OPERATIONS).optional().describe(`Operation. Default: content`),
  knowledgeId: z.string().describe("Knowledge base ID — get from smart_search or keyword_lookup"),
  relativePaths: z
    .array(z.string())
    .max(MAX_METADATA_PATHS)
    .optional()
    .describe(`File paths for metadata operation (max ${MAX_METADATA_PATHS})`),
  relativePath: z.string().optional().describe("Single file path for content operation"),
  fromLine: z.number().int().min(1).optional().describe("1-based start line (content op)"),
  toLine: z.number().int().min(1).optional().describe("1-based end line (content op)"),
  maxTokens: z
    .number()
    .int()
    .min(MIN_TOKENS)
    .max(MAX_TOKENS)
    .optional()
    .describe(`Response token cap for content op (default 10000, max ${MAX_TOKENS})`),
  search: z
    .string()
    .optional()
    .describe("Search term — content op returns only matching lines + context; required for bulk_search"),
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(MAX_CONTEXT_LINES)
    .optional()
    .describe(`Lines of context around each match (default 3, max ${MAX_CONTEXT_LINES})`),
  paths: z
    .array(z.string())
    .max(MAX_BULK_PATHS)
    .optional()
    .describe(`File paths for bulk_search (max ${MAX_BULK_PATHS})`),
  matchOnly: z.boolean().optional().describe("bulk_search only — return only counts and line numbers, no context"),
};

interface RetrieveFileInput {
  operation?: (typeof OPERATIONS)[number] | undefined;
  knowledgeId: string;
  relativePaths?: string[] | undefined;
  relativePath?: string | undefined;
  fromLine?: number | undefined;
  toLine?: number | undefined;
  maxTokens?: number | undefined;
  search?: string | undefined;
  contextLines?: number | undefined;
  paths?: string[] | undefined;
  matchOnly?: boolean | undefined;
}

export function registerRetrieveFileTool(server: McpServer): void {
  server.registerTool("retrieve_file", { description, inputSchema: schema }, async (args: RetrieveFileInput) => {
    const result = await dispatch(args);
    return { content: [{ type: "text" as const, text: formatResult(result) }] };
  });
}

type DispatchResult = MetadataResult | ContentResult | BulkSearchResult;

async function dispatch(args: RetrieveFileInput): Promise<DispatchResult> {
  const op = args.operation ?? "content";
  if (op === "metadata") {
    const paths = args.relativePaths ?? [];
    if (paths.length === 0) {
      throw new Error("metadata requires relativePaths[] (1..10 entries).");
    }
    return fetchMetadata(args.knowledgeId, paths);
  }
  if (op === "bulk_search") {
    const paths = args.paths ?? [];
    if (paths.length === 0) {
      throw new Error("bulk_search requires paths[] (1..50 entries).");
    }
    if (args.search === undefined || args.search.length === 0) {
      throw new Error("bulk_search requires a non-empty search string.");
    }
    return bulkSearch({
      knowledgeId: args.knowledgeId,
      paths,
      search: args.search,
      ...(args.contextLines !== undefined ? { contextLines: args.contextLines } : {}),
      ...(args.matchOnly !== undefined ? { matchOnly: args.matchOnly } : {}),
    });
  }
  if (args.relativePath === undefined || args.relativePath.length === 0) {
    throw new Error("content requires a relativePath.");
  }
  return readFileRange({
    knowledgeId: args.knowledgeId,
    relativePath: args.relativePath,
    ...(args.fromLine !== undefined ? { fromLine: args.fromLine } : {}),
    ...(args.toLine !== undefined ? { toLine: args.toLine } : {}),
    ...(args.maxTokens !== undefined ? { maxTokens: args.maxTokens } : {}),
    ...(args.search !== undefined ? { search: args.search } : {}),
    ...(args.contextLines !== undefined ? { contextLines: args.contextLines } : {}),
  });
}

function formatResult(result: DispatchResult): string {
  if (result.operation === "content") {
    const lines: string[] = [];
    lines.push(`# ${result.relativePath}`);
    lines.push(`Lines: ${result.fromLine}-${result.toLine} of ${result.totalLines}`);
    if (result.truncated) {
      lines.push(`Truncated: yes`);
    }
    if (result.hasMore && result.nextFromLine !== undefined) {
      lines.push(`More: fromLine=${result.nextFromLine}`);
    }
    lines.push("");
    lines.push(result.content);
    return lines.join("\n");
  }
  if (result.operation === "content_search") {
    const lines: string[] = [];
    lines.push(`# ${result.relativePath}`);
    lines.push(`Search: "${result.search}" → ${result.searchMatches} match(es) in ${result.totalLines} lines`);
    lines.push("");
    for (const match of result.matches) {
      lines.push(match.context);
      lines.push("");
    }
    return lines.join("\n");
  }
  return JSON.stringify(result, null, 2);
}
