import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UsageTracker } from "@bb/llm";
import { toNeo4jInt } from "@bb/neo4j";
import { getLogger } from "@bb/logger";
import {
  CHANNEL_RUNNERS,
  buildFulltextQuery,
  type ChannelName,
  type ScoredHit,
  type SearchParams,
} from "./smartSearchChannels.ts";
import {
  attachRepoNames,
  clusterByFolder,
  fuseHits,
  type FusedResult,
  type SmartSearchResult,
} from "./smartSearchFusion.ts";
import { EXCLUSION_CATEGORIES, buildExclusionParams, type ExclusionCategory } from "./searchExclusions.ts";

const RESULT_CAP_PER_CHANNEL = 100;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 10;
const MAX_RESPONSE_CHARS = 32_000;
const MIN_TRIMMED_RESULTS = 5;

const description = `Search the indexed knowledge graph across all eight channels in one call.

Channels run in parallel:
- purpose          — fulltext over File.purpose + File.summary
- businessContext  — fulltext over File.businessContext (business/product framing)
- paths            — case-insensitive contains over File.relativePath
- keywords         — fulltext over Keyword.name (linked via HAS_KEYWORD)
- classes          — fulltext over Class.signature (linked via HAS_CLASS)
- functions        — fulltext over Function.signature (linked via HAS_FUNCTION)
- importsInternal  — case-insensitive contains over Module.name (linked via HAS_IMPORT_INTERNAL — relative imports only)
- importsExternal  — case-insensitive contains over Module.name (linked via HAS_IMPORT_EXTERNAL — external packages / stdlib)

Returns a deduplicated, fused top-K list of files plus folder clusters.

PARAMS:
- query: search term (required)
- knowledgeId: scope to a single repo (omit for cross-repo search)
- path: scope to files under this path prefix (e.g. "packages/auth")
- exclude: filter out file categories (tests | vendor | config | generated | docs | build)
- page / pageSize: pagination over the fused result set`;

const schema = {
  query: z.string().min(1).describe("Search term"),
  knowledgeId: z.string().optional().describe("Scope to a single repo. Omit for cross-repo search."),
  path: z.string().optional().describe("Scope to files under this path prefix (e.g. 'src/auth')."),
  exclude: z
    .array(z.enum(EXCLUSION_CATEGORIES))
    .optional()
    .describe(`Exclude file categories. Options: ${EXCLUSION_CATEGORIES.join(", ")}`),
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  pageSize: z
    .number()
    .int()
    .min(MIN_PAGE_SIZE)
    .max(MAX_PAGE_SIZE)
    .optional()
    .describe(`Items per page (default ${DEFAULT_PAGE_SIZE})`),
};

interface SmartSearchInput {
  query: string;
  knowledgeId?: string | undefined;
  path?: string | undefined;
  exclude?: ExclusionCategory[] | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export function registerSmartSearchTool(server: McpServer): void {
  server.registerTool("smart_search", { description, inputSchema: schema }, async (args: SmartSearchInput) => {
    const startTime = Date.now();
    const result = await runSmartSearch(args);
    let payload = JSON.stringify(result, null, 2);
    payload = trimToCharBudget(result, payload);
    const durationMs = Date.now() - startTime;

    // Track usage
    await UsageTracker.track("local-user", "smart_search", args.query, payload, durationMs);

    return { content: [{ type: "text" as const, text: payload }] };
  });
}

async function runSmartSearch(args: SmartSearchInput): Promise<SmartSearchResult> {
  const queryTerms = args.query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter((term) => term.length > 0);
  const exclusions = buildExclusionParams(args.exclude ?? []);
  const params: SearchParams = {
    knowledgeId: args.knowledgeId ?? null,
    pathPrefix: args.path ?? null,
    queryTerms: queryTerms.length === 0 ? [args.query.trim().toLowerCase()] : queryTerms,
    fulltextQuery: buildFulltextQuery(queryTerms.length === 0 ? [args.query.trim().toLowerCase()] : queryTerms),
    resultCap: toNeo4jInt(RESULT_CAP_PER_CHANNEL),
    excludeSuffixes: exclusions.suffixes,
    excludeContains: exclusions.contains,
  };

  const channelNames = Object.keys(CHANNEL_RUNNERS) as ChannelName[];
  const log = getLogger("server");
  const settled = await Promise.all(
    channelNames.map(async (channel): Promise<{ channel: ChannelName; hits: ScoredHit[] }> => {
      try {
        const runner = CHANNEL_RUNNERS[channel];
        const hits = await runner(params);
        return { channel, hits };
      } catch (err: unknown) {
        log.warn("smart_search channel failed", {
          channel,
          query: args.query,
          error: err instanceof Error ? err.message : String(err),
        });
        return { channel, hits: [] };
      }
    }),
  );

  const perChannel: Record<ChannelName, ScoredHit[]> = {
    purpose: [],
    businessContext: [],
    paths: [],
    keywords: [],
    classes: [],
    functions: [],
    importsInternal: [],
    importsExternal: [],
  };
  const channelsUsed: ChannelName[] = [];
  for (const entry of settled) {
    perChannel[entry.channel] = entry.hits;
    if (entry.hits.length > 0) {
      channelsUsed.push(entry.channel);
    }
  }

  const fused = fuseHits(perChannel);
  const sortedResults = Array.from(fused.values()).sort((a, b) => b.score - a.score);
  await attachRepoNames(sortedResults);

  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? DEFAULT_PAGE_SIZE;
  const start = (page - 1) * pageSize;
  const pageResults = sortedResults.slice(start, start + pageSize);
  const reposMatched = uniqueRepoNames(pageResults);
  const clusters = clusterByFolder(pageResults);

  return {
    query: args.query,
    channels_used: channelsUsed,
    total_matches: sortedResults.length,
    repos_matched: reposMatched,
    top_results: pageResults,
    clusters,
  };
}

function uniqueRepoNames(results: FusedResult[]): string[] {
  const seen = new Set<string>();
  for (const result of results) {
    if (result.repo_name.length > 0) {
      seen.add(result.repo_name);
    }
  }
  return Array.from(seen);
}

function trimToCharBudget(result: SmartSearchResult, current: string): string {
  if (current.length <= MAX_RESPONSE_CHARS) {
    return current;
  }
  let count = result.top_results.length;
  let trimmed = current;
  while (count > MIN_TRIMMED_RESULTS && trimmed.length > MAX_RESPONSE_CHARS) {
    count = Math.floor(count * 0.7);
    const view = {
      ...result,
      top_results: result.top_results.slice(0, count),
      _note: `Trimmed to ${count} of ${result.top_results.length} results — narrow with knowledgeId or path.`,
    };
    trimmed = JSON.stringify(view, null, 2);
  }
  return trimmed;
}
