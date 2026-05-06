import { KnowledgeState, type KnowledgeDoc } from "@bb/types";
import { KnowledgeNotFoundError } from "@bb/errors";
import { _getDb } from "./client.ts";
import { Collections } from "./collections.ts";

const DEFAULT_LIST_LIMIT = 200;

export interface KnowledgeListEntry extends KnowledgeDoc {
  fileCount: number;
}

export async function setKnowledgeState(knowledgeId: string, state: KnowledgeState): Promise<void> {
  const result = await _getDb()
    .collection(Collections.Knowledge)
    .updateOne({ knowledgeId }, { $set: { "status.state": state, updatedAt: new Date() } });
  if (result.matchedCount === 0) {
    throw new KnowledgeNotFoundError(knowledgeId);
  }
}

export async function upsertKnowledge(doc: Omit<KnowledgeDoc, "updatedAt"> & { updatedAt?: Date }): Promise<void> {
  const now = new Date();
  await _getDb()
    .collection(Collections.Knowledge)
    .updateOne(
      { knowledgeId: doc.knowledgeId },
      {
        $set: {
          source: doc.source,
          status: doc.status,
          updatedAt: doc.updatedAt ?? now,
        },
        $setOnInsert: {
          knowledgeId: doc.knowledgeId,
          createdAt: doc.createdAt,
        },
      },
      { upsert: true },
    );
}

export interface DeleteKnowledgeResult {
  knowledgeDeleted: number;
  rawDeleted: number;
  statsDeleted: number;
}

export async function deleteKnowledge(knowledgeId: string): Promise<DeleteKnowledgeResult> {
  const db = _getDb();
  const knowledgeRes = await db.collection(Collections.Knowledge).deleteOne({ knowledgeId });
  if (knowledgeRes.deletedCount === 0) {
    throw new KnowledgeNotFoundError(knowledgeId);
  }
  const rawRes = await db.collection(Collections.Raw).deleteMany({ knowledgeId });
  const statsRes = await db.collection(Collections.ProcessingStats).deleteMany({ knowledgeId });
  return {
    knowledgeDeleted: knowledgeRes.deletedCount ?? 0,
    rawDeleted: rawRes.deletedCount ?? 0,
    statsDeleted: statsRes.deletedCount ?? 0,
  };
}

export async function listKnowledge(opts: { limit?: number } = {}): Promise<KnowledgeListEntry[]> {
  const db = _getDb();
  const limit = opts.limit ?? DEFAULT_LIST_LIMIT;
  const docs = (await db
    .collection(Collections.Knowledge)
    .find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray()) as unknown as KnowledgeDoc[];

  const entries: KnowledgeListEntry[] = [];
  for (const doc of docs) {
    const fileCount = await db.collection(Collections.Raw).countDocuments({ knowledgeId: doc.knowledgeId });
    entries.push({ ...doc, fileCount });
  }
  return entries;
}
