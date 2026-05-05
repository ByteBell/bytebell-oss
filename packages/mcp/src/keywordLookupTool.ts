import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runCypher } from "@bb/neo4j";
import { buildFulltextQuery, escapeLucene } from "./smartSearchChannels.ts";

const MATCH_MODES = ["keyword", "class", "function", "module"] as const;
type MatchMode = (typeof MATCH_MODES)[number];

const DEFAULT_KEYWORD_LIMIT = 20;
const MAX_KEYWORD_LIMIT = 50;
const DEFAULT_FILES_PER_KEYWORD = 20;
const MAX_FILES_PER_KEYWORD = 100;
const MAX_PAGE_CHARS = 20_000;

const description = `Reverse lookup: find named entities (keywords, classes, functions, modules) across the indexed graph and list every file linked to each one.

PARAMS:
- term: search term (case-insensitive contains)
- match: which entity to look up — "keyword" (default), "class", "function", or "module"
- knowledgeId: scope to a single repo (omit for cross-repo)
- keywordLimit: max matched entities to return (default 20, max 50)
- filesPerKeyword: max files returned per matched entity (default 20, max 100)
- page: page number for paginated results (default 1)

For "class" / "function" the returned \`name\` is the full analyzer signature including its approximate line range and one-line summary, e.g. "AuthService (~L12-58): handles login".`;

const schema = {
  term: z.string().min(1).describe("Search term (case-insensitive contains)"),
  match: z
    .enum(MATCH_MODES)
    .optional()
    .describe(`Entity to look up. Options: ${MATCH_MODES.join(", ")}. Default: keyword`),
  knowledgeId: z.string().optional().describe("Scope to a single repo. Omit for cross-repo."),
  keywordLimit: z
    .number()
    .int()
    .min(1)
    .max(MAX_KEYWORD_LIMIT)
    .optional()
    .describe(`Max matched entities (default ${DEFAULT_KEYWORD_LIMIT}, max ${MAX_KEYWORD_LIMIT})`),
  filesPerKeyword: z
    .number()
    .int()
    .min(1)
    .max(MAX_FILES_PER_KEYWORD)
    .optional()
    .describe(`Max files per entity (default ${DEFAULT_FILES_PER_KEYWORD}, max ${MAX_FILES_PER_KEYWORD})`),
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
};

interface KeywordLookupInput {
  term: string;
  match?: MatchMode | undefined;
  knowledgeId?: string | undefined;
  keywordLimit?: number | undefined;
  filesPerKeyword?: number | undefined;
  page?: number | undefined;
}

interface MatchedFile {
  path: string;
  purpose: string;
  summary: string;
  repo_name: string;
  knowledge_id: string;
}

interface MatchedEntity {
  name: string;
  file_count: number;
  files: MatchedFile[];
}

interface KeywordLookupResult {
  query: string;
  match: MatchMode;
  cross_repo: boolean;
  total_matched: number;
  matched: MatchedEntity[];
  pagination: {
    page: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    hint?: string;
  };
}

interface RowShape {
  name: string;
  path: string | null;
  purpose: string | null;
  summary: string | null;
  repoName: string | null;
  knowledgeId: string | null;
}

export function registerKeywordLookupTool(server: McpServer): void {
  server.registerTool("keyword_lookup", { description, inputSchema: schema }, async (args: KeywordLookupInput) => {
    const result = await runKeywordLookup(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
}

async function runKeywordLookup(args: KeywordLookupInput): Promise<KeywordLookupResult> {
  const match: MatchMode = args.match ?? "keyword";
  const keywordLimit = args.keywordLimit ?? DEFAULT_KEYWORD_LIMIT;
  const filesPerKeyword = args.filesPerKeyword ?? DEFAULT_FILES_PER_KEYWORD;
  const page = args.page ?? 1;

  const rows = await runMatchQuery({
    match,
    term: args.term,
    knowledgeId: args.knowledgeId ?? null,
    keywordLimit,
    filesPerKeyword,
  });

  const grouped = groupByName(rows, filesPerKeyword);
  const totalMatched = grouped.length;
  const { pageEntries, totalPages } = paginate(grouped, page);

  return {
    query: args.term,
    match,
    cross_repo: args.knowledgeId === undefined,
    total_matched: totalMatched,
    matched: pageEntries,
    pagination: {
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      ...(page < totalPages
        ? { hint: `Truncated to ~${MAX_PAGE_CHARS / 4} tokens. Call again with page: ${page + 1}.` }
        : {}),
    },
  };
}

interface MatchQueryArgs {
  match: MatchMode;
  term: string;
  knowledgeId: string | null;
  keywordLimit: number;
  filesPerKeyword: number;
}

async function runMatchQuery(args: MatchQueryArgs): Promise<RowShape[]> {
  const lower = args.term.toLowerCase();
  const cypher = cypherForMatch(args.match);
  const params: Record<string, unknown> = {
    knowledgeId: args.knowledgeId,
    keywordLimit: args.keywordLimit,
    filesPerKeyword: args.filesPerKeyword,
  };
  if (args.match === "module") {
    params["term"] = lower;
  } else {
    params["fulltextQuery"] = buildFulltextQuery([escapeLucene(lower)]);
  }
  return runCypher<RowShape>(cypher, params);
}

function cypherForMatch(match: MatchMode): string {
  if (match === "keyword") {
    return `
      CALL db.index.fulltext.queryNodes('idx_keyword_name_ft', $fulltextQuery) YIELD node AS kw, score
      WITH kw, score ORDER BY score DESC LIMIT $keywordLimit
      MATCH (f:File)-[:HAS_KEYWORD]->(kw)
      WHERE ($knowledgeId IS NULL OR f.knowledgeId = $knowledgeId)
      MATCH (k:Knowledge {knowledgeId: f.knowledgeId})
      WITH kw, f, k LIMIT $keywordLimit * $filesPerKeyword
      RETURN kw.name AS name,
             f.relativePath AS path,
             f.purpose AS purpose,
             f.summary AS summary,
             k.repoName AS repoName,
             f.knowledgeId AS knowledgeId
    `;
  }
  if (match === "module") {
    return `
      MATCH (m:Module) WHERE toLower(m.name) CONTAINS $term
      WITH m ORDER BY m.name LIMIT $keywordLimit
      MATCH (f:File)-[:HAS_IMPORT]->(m)
      WHERE ($knowledgeId IS NULL OR f.knowledgeId = $knowledgeId)
      MATCH (k:Knowledge {knowledgeId: f.knowledgeId})
      WITH m, f, k LIMIT $keywordLimit * $filesPerKeyword
      RETURN m.name AS name,
             f.relativePath AS path,
             f.purpose AS purpose,
             f.summary AS summary,
             k.repoName AS repoName,
             f.knowledgeId AS knowledgeId
    `;
  }
  const label = match === "class" ? "Class" : "Function";
  const rel = match === "class" ? "HAS_CLASS" : "HAS_FUNCTION";
  return `
    CALL db.index.fulltext.queryNodes('idx_symbol_signature_ft', $fulltextQuery) YIELD node AS sym, score
    WHERE '${label}' IN labels(sym)
    WITH sym, score ORDER BY score DESC LIMIT $keywordLimit
    MATCH (f:File)-[:${rel}]->(sym)
    WHERE ($knowledgeId IS NULL OR f.knowledgeId = $knowledgeId)
    MATCH (k:Knowledge {knowledgeId: f.knowledgeId})
    WITH sym, f, k LIMIT $keywordLimit * $filesPerKeyword
    RETURN sym.signature AS name,
           f.relativePath AS path,
           f.purpose AS purpose,
           f.summary AS summary,
           k.repoName AS repoName,
           f.knowledgeId AS knowledgeId
  `;
}

function groupByName(rows: RowShape[], filesPerKeyword: number): MatchedEntity[] {
  const buckets = new Map<string, MatchedEntity>();
  for (const row of rows) {
    const name = row.name;
    let entity = buckets.get(name);
    if (entity === undefined) {
      entity = { name, file_count: 0, files: [] };
      buckets.set(name, entity);
    }
    if (row.path !== null && row.knowledgeId !== null && entity.files.length < filesPerKeyword) {
      entity.files.push({
        path: row.path,
        purpose: row.purpose ?? "",
        summary: row.summary ?? "",
        repo_name: row.repoName ?? "",
        knowledge_id: row.knowledgeId,
      });
    }
  }
  for (const entity of buckets.values()) {
    entity.file_count = entity.files.length;
  }
  return Array.from(buckets.values());
}

interface PageSlice {
  pageEntries: MatchedEntity[];
  totalPages: number;
}

function paginate(entries: MatchedEntity[], page: number): PageSlice {
  if (entries.length === 0) {
    return { pageEntries: [], totalPages: 1 };
  }
  const breaks: number[] = [0];
  let charBudget = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const charCost = JSON.stringify(entries[i]).length;
    if (charBudget + charCost > MAX_PAGE_CHARS && charBudget > 0) {
      breaks.push(i);
      charBudget = 0;
    }
    charBudget += charCost;
  }
  breaks.push(entries.length);
  const totalPages = Math.max(1, breaks.length - 1);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = breaks[safePage - 1] ?? 0;
  const end = breaks[safePage] ?? entries.length;
  return { pageEntries: entries.slice(start, end), totalPages };
}
