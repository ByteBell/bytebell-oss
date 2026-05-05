import { runCypher } from "@bb/neo4j";
import { EXCLUSION_WHERE } from "./searchExclusions.ts";

export interface ScoredHit {
  path: string;
  knowledgeId: string;
  score: number;
}

export interface SearchParams extends Record<string, unknown> {
  knowledgeId: string | null;
  pathPrefix: string | null;
  queryTerms: string[];
  fulltextQuery: string;
  resultCap: number;
  excludeSuffixes: string[];
  excludeContains: string[];
}

interface RowShape {
  path: string;
  knowledgeId: string;
  score: number;
}

const SHARED_FILE_FILTERS = `
  ($knowledgeId IS NULL OR f.knowledgeId = $knowledgeId)
  AND ($pathPrefix IS NULL OR f.relativePath STARTS WITH $pathPrefix)
${EXCLUSION_WHERE}`;

const COLLECT_RETURN = `
RETURN f.relativePath AS path, f.knowledgeId AS knowledgeId, score
`;

function toScoredHits(rows: RowShape[]): ScoredHit[] {
  return rows.map((row) => ({
    path: row.path,
    knowledgeId: row.knowledgeId,
    score: Number(row.score) || 0,
  }));
}

async function chPurpose(params: SearchParams): Promise<ScoredHit[]> {
  const cypher = `
    CALL db.index.fulltext.queryNodes('idx_file_purpose_summary_ft', $fulltextQuery)
    YIELD node AS f, score
    WHERE ${SHARED_FILE_FILTERS}
    WITH f, score ORDER BY score DESC LIMIT $resultCap
    ${COLLECT_RETURN}
  `;
  return toScoredHits(await runCypher<RowShape>(cypher, params));
}

async function chPaths(params: SearchParams): Promise<ScoredHit[]> {
  const isSingle = params.queryTerms.length === 1;
  const cypher = isSingle
    ? `
      MATCH (f:File)
      WHERE ${SHARED_FILE_FILTERS}
        AND toLower(f.relativePath) CONTAINS $queryTerms[0]
      WITH f, 1.0 AS score
      ORDER BY f.relativePath LIMIT $resultCap
      ${COLLECT_RETURN}
    `
    : `
      MATCH (f:File)
      WHERE ${SHARED_FILE_FILTERS}
        AND ANY(term IN $queryTerms WHERE toLower(f.relativePath) CONTAINS term)
      WITH f,
           toFloat(SIZE([term IN $queryTerms WHERE toLower(f.relativePath) CONTAINS term])) /
             toFloat(SIZE($queryTerms)) AS score
      ORDER BY score DESC, f.relativePath LIMIT $resultCap
      ${COLLECT_RETURN}
    `;
  return toScoredHits(await runCypher<RowShape>(cypher, params));
}

async function chKeywords(params: SearchParams): Promise<ScoredHit[]> {
  const cypher = `
    CALL db.index.fulltext.queryNodes('idx_keyword_name_ft', $fulltextQuery)
    YIELD node AS kw, score
    MATCH (f:File)-[:HAS_KEYWORD]->(kw)
    WHERE ${SHARED_FILE_FILTERS}
    WITH DISTINCT f, max(score) AS score
    ORDER BY score DESC LIMIT $resultCap
    ${COLLECT_RETURN}
  `;
  return toScoredHits(await runCypher<RowShape>(cypher, params));
}

async function chClasses(params: SearchParams): Promise<ScoredHit[]> {
  return symbolChannel(params, "Class", "HAS_CLASS");
}

async function chFunctions(params: SearchParams): Promise<ScoredHit[]> {
  return symbolChannel(params, "Function", "HAS_FUNCTION");
}

async function symbolChannel(
  params: SearchParams,
  label: "Class" | "Function",
  rel: "HAS_CLASS" | "HAS_FUNCTION",
): Promise<ScoredHit[]> {
  const cypher = `
    CALL db.index.fulltext.queryNodes('idx_symbol_signature_ft', $fulltextQuery)
    YIELD node AS sym, score
    WHERE '${label}' IN labels(sym)
    MATCH (f:File)-[:${rel}]->(sym)
    WHERE ${SHARED_FILE_FILTERS}
    WITH DISTINCT f, max(score) AS score
    ORDER BY score DESC LIMIT $resultCap
    ${COLLECT_RETURN}
  `;
  return toScoredHits(await runCypher<RowShape>(cypher, params));
}

async function chImports(params: SearchParams): Promise<ScoredHit[]> {
  const cypher = `
    MATCH (m:Module)
    WHERE ANY(term IN $queryTerms WHERE toLower(m.name) CONTAINS term)
    MATCH (f:File)-[:HAS_IMPORT]->(m)
    WHERE ${SHARED_FILE_FILTERS}
    WITH DISTINCT f, 1.0 AS score
    ORDER BY f.relativePath LIMIT $resultCap
    ${COLLECT_RETURN}
  `;
  return toScoredHits(await runCypher<RowShape>(cypher, params));
}

export type ChannelName = "purpose" | "paths" | "keywords" | "classes" | "functions" | "imports";

export const CHANNEL_RUNNERS: Record<ChannelName, (params: SearchParams) => Promise<ScoredHit[]>> = {
  purpose: chPurpose,
  paths: chPaths,
  keywords: chKeywords,
  classes: chClasses,
  functions: chFunctions,
  imports: chImports,
};

export function escapeLucene(term: string): string {
  return term.replace(/[+\-&|!(){}[\]^"~*?:\\/]/gu, "\\$&");
}

export function buildFulltextQuery(terms: readonly string[]): string {
  return terms.map((term) => `*${escapeLucene(term)}*`).join(" ");
}
