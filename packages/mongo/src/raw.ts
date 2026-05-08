import { _getDb } from "./client.ts";
import { Collections } from "./collections.ts";

export interface FileAnalysis {
  purpose: string;
  summary: string;
  businessContext: string;
  classes: string[];
  functions: string[];
  importsInternal: string[];
  importsExternal: string[];
  keywords: string[];
}

export interface RawFileDoc {
  knowledgeId: string;
  relativePath: string;
  content: string;
  sha: string;
  sizeBytes: number;
  language: string;
  analysis: FileAnalysis;
  updatedAt: Date;
}

export async function upsertRawFile(doc: Omit<RawFileDoc, "updatedAt">): Promise<void> {
  await _getDb()
    .collection(Collections.Raw)
    .updateOne(
      { knowledgeId: doc.knowledgeId, relativePath: doc.relativePath },
      { $set: { ...doc, updatedAt: new Date() } },
      { upsert: true },
    );
}

/**
 * Returns the `relativePath → sha` map for every raw file currently stored
 * under `knowledgeId`. Used by the pull worker to diff the new tree against
 * the previously-indexed tree without needing git history.
 */
export async function listRawFileShas(knowledgeId: string): Promise<Map<string, string>> {
  const cursor = _getDb()
    .collection(Collections.Raw)
    .find({ knowledgeId }, { projection: { _id: 0, relativePath: 1, sha: 1 } });
  const docs = (await cursor.toArray()) as unknown as Array<{ relativePath: string; sha: string }>;
  const map = new Map<string, string>();
  for (const doc of docs) {
    map.set(doc.relativePath, doc.sha);
  }
  return map;
}

/**
 * Deletes every `raw_files` row in `relativePaths` for `knowledgeId`. No-op
 * when `relativePaths` is empty. Returns the count actually removed.
 */
export async function deleteRawFiles(knowledgeId: string, relativePaths: string[]): Promise<number> {
  if (relativePaths.length === 0) {
    return 0;
  }
  const result = await _getDb()
    .collection(Collections.Raw)
    .deleteMany({ knowledgeId, relativePath: { $in: relativePaths } });
  return result.deletedCount ?? 0;
}
