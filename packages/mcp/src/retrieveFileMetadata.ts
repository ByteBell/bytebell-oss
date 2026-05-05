import { runCypher } from "@bb/neo4j";

export interface FileMetadata {
  path: string;
  language: string;
  sizeBytes: number;
  purpose: string;
  summary: string;
  keywords: string[];
  classes: string[];
  functions: string[];
  imports: string[];
}

export interface MetadataResult {
  operation: "metadata";
  knowledgeId: string;
  totalRequested: number;
  totalFound: number;
  files: FileMetadata[];
  notFound: string[];
}

interface RowShape {
  path: string;
  language: string | null;
  sizeBytes: number | null;
  purpose: string | null;
  summary: string | null;
  keywords: (string | null)[];
  classes: (string | null)[];
  functions: (string | null)[];
  imports: (string | null)[];
}

export async function fetchMetadata(knowledgeId: string, relativePaths: readonly string[]): Promise<MetadataResult> {
  if (relativePaths.length === 0) {
    return {
      operation: "metadata",
      knowledgeId,
      totalRequested: 0,
      totalFound: 0,
      files: [],
      notFound: [],
    };
  }
  const rows = await runCypher<RowShape>(
    `
    MATCH (f:File)
    WHERE f.knowledgeId = $knowledgeId AND f.relativePath IN $paths
    OPTIONAL MATCH (f)-[:HAS_KEYWORD]->(kw:Keyword)
    OPTIONAL MATCH (f)-[:HAS_CLASS]->(c:Class)
    OPTIONAL MATCH (f)-[:HAS_FUNCTION]->(fn:Function)
    OPTIONAL MATCH (f)-[:HAS_IMPORT]->(m:Module)
    RETURN f.relativePath AS path,
           f.language AS language,
           f.sizeBytes AS sizeBytes,
           f.purpose AS purpose,
           f.summary AS summary,
           collect(DISTINCT kw.name) AS keywords,
           collect(DISTINCT c.signature) AS classes,
           collect(DISTINCT fn.signature) AS functions,
           collect(DISTINCT m.name) AS imports
    `,
    { knowledgeId, paths: relativePaths },
  );
  const files = rows.map(rowToMetadata);
  const found = new Set(files.map((file) => file.path));
  const notFound = relativePaths.filter((p) => !found.has(p));
  return {
    operation: "metadata",
    knowledgeId,
    totalRequested: relativePaths.length,
    totalFound: files.length,
    files,
    notFound,
  };
}

function rowToMetadata(row: RowShape): FileMetadata {
  return {
    path: row.path,
    language: row.language ?? "plaintext",
    sizeBytes: Number(row.sizeBytes ?? 0),
    purpose: row.purpose ?? "",
    summary: row.summary ?? "",
    keywords: filterStrings(row.keywords),
    classes: filterStrings(row.classes),
    functions: filterStrings(row.functions),
    imports: filterStrings(row.imports),
  };
}

function filterStrings(items: readonly (string | null)[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
    }
  }
  return out;
}
