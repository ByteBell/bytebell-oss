import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UsageTracker } from "@bb/llm";
import { runCypher } from "@bb/neo4j";

const MAX_PAGE_CHARS = 20_000;

const description = `Discover indexed repositories and their knowledgeId UUIDs.

Always call this first when you need a knowledgeId and don't already
have one. Returns one row per indexed repo with repoName, sourceKind,
state, and fileCount. The knowledgeId is always a UUID — never guess
it from a repo name; pull it from this response.

State flow: CREATED → QUEUED → INGESTED → PROCESSING → PROCESSED |
FAILED. Treat any state other than PROCESSED as not-yet-queryable —
either back off or pick a different repo.

PARAMS:
- page: page number (default 1). Pages are packed to ~5000 tokens.`;

const schema = {
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
};

interface ListKnowledgeInput {
  page?: number | undefined;
}

interface KnowledgeRow {
  knowledgeId: string;
  repoName: string;
  sourceKind: string;
  sourceUrl: string;
  branch: string | null;
  state: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

interface ListKnowledgeResult {
  knowledgeBases: KnowledgeRow[];
  totalItems: number;
  pagination: {
    page: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    hint?: string;
  };
}

interface RawRow {
  knowledgeId: string | null;
  repoName: string | null;
  sourceKind: string | null;
  sourceUrl: string | null;
  branch: string | null;
  state: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fileCount: number | { toNumber: () => number } | null;
}

export function registerListKnowledgeTool(server: McpServer): void {
  server.registerTool("list_knowledge", { description, inputSchema: schema }, async (args: ListKnowledgeInput) => {
    const startTime = Date.now();
    const result = await runListKnowledge(args);
    const payload = JSON.stringify(result, null, 2);
    const durationMs = Date.now() - startTime;

    // Track usage
    await UsageTracker.track("local-user", "list_knowledge", "list_knowledge", payload, durationMs);

    return { content: [{ type: "text" as const, text: payload }] };
  });
}

async function runListKnowledge(args: ListKnowledgeInput): Promise<ListKnowledgeResult> {
  const page = args.page ?? 1;
  const rows = await fetchAllRows();
  const totalItems = rows.length;
  const { pageRows, totalPages, safePage } = paginate(rows, page);

  const pagination: ListKnowledgeResult["pagination"] = {
    page: safePage,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
  if (safePage < totalPages) {
    pagination.hint = `Truncated. Call again with page: ${safePage + 1}.`;
  }

  return {
    knowledgeBases: pageRows,
    totalItems,
    pagination,
  };
}

async function fetchAllRows(): Promise<KnowledgeRow[]> {
  const cypher = `
    MATCH (k:Knowledge)
    OPTIONAL MATCH (k)-[:HAS_FILE]->(f:File)
    WITH k, count(f) AS fileCount
    RETURN k.knowledgeId AS knowledgeId,
           k.repoName    AS repoName,
           k.sourceKind  AS sourceKind,
           k.sourceUrl   AS sourceUrl,
           k.branch      AS branch,
           k.state       AS state,
           k.createdAt   AS createdAt,
           k.updatedAt   AS updatedAt,
           fileCount
    ORDER BY k.updatedAt DESC
  `;
  const raw = await runCypher<RawRow>(cypher, {});
  return raw.map(coerceRow);
}

function coerceRow(row: RawRow): KnowledgeRow {
  return {
    knowledgeId: row.knowledgeId ?? "",
    repoName: row.repoName ?? "",
    sourceKind: row.sourceKind ?? "",
    sourceUrl: row.sourceUrl ?? "",
    branch: row.branch,
    state: row.state ?? "",
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
    fileCount: toNumber(row.fileCount),
  };
}

function toNumber(value: RawRow["fileCount"]): number {
  if (value === null) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  return value.toNumber();
}

interface PageSlice {
  pageRows: KnowledgeRow[];
  totalPages: number;
  safePage: number;
}

function paginate(rows: KnowledgeRow[], page: number): PageSlice {
  if (rows.length === 0) {
    return { pageRows: [], totalPages: 1, safePage: 1 };
  }
  const breaks: number[] = [0];
  let charBudget = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const cost = JSON.stringify(rows[i]).length;
    if (charBudget + cost > MAX_PAGE_CHARS && charBudget > 0) {
      breaks.push(i);
      charBudget = 0;
    }
    charBudget += cost;
  }
  breaks.push(rows.length);
  const totalPages = Math.max(1, breaks.length - 1);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = breaks[safePage - 1] ?? 0;
  const end = breaks[safePage] ?? rows.length;
  return { pageRows: rows.slice(start, end), totalPages, safePage };
}
