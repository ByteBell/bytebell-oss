import { _getDb } from "./client.ts";
import { Collections } from "./collections.ts";

export interface FileAnalysis {
  purpose: string;
  summary: string;
  classes: string[];
  functions: string[];
  imports: string[];
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
