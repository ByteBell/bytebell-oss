import type {
  KnowledgeDoc,
  ModelTokenBreakdown,
  ProcessingStatsDoc,
  StatsCommitEntry,
  StatsRepoEntry,
  StatsResponse,
  StatsTotals,
} from "@bb/types";
import { _getDb } from "./client.ts";
import { Collections } from "./collections.ts";

export interface RecordProcessingStatsInput {
  knowledgeId: string;
  repoName: string;
  commitHash: string;
  modelTokens: ModelTokenBreakdown;
  estimatedCost: number;
  totalBatches: number;
  totalFiles: number;
  totalFolders: number;
  filesAnalyzed: number;
  processingTimeMs: number;
}

const COST_UNKNOWN = -1;

export async function recordProcessingStats(input: RecordProcessingStatsInput): Promise<void> {
  const now = new Date();
  const totals = sumModelTokens(input.modelTokens);
  await _getDb()
    .collection(Collections.ProcessingStats)
    .updateOne(
      { knowledgeId: input.knowledgeId, commitHash: input.commitHash },
      {
        $set: {
          repoName: input.repoName,
          modelTokens: input.modelTokens,
          inputTokens: totals.inputTokens,
          outputTokens: totals.outputTokens,
          estimatedCost: input.estimatedCost,
          totalBatches: input.totalBatches,
          totalFiles: input.totalFiles,
          totalFolders: input.totalFolders,
          filesAnalyzed: input.filesAnalyzed,
          processingTimeMs: input.processingTimeMs,
          updatedAt: now,
        },
        $setOnInsert: {
          knowledgeId: input.knowledgeId,
          commitHash: input.commitHash,
          createdAt: now,
        },
      },
      { upsert: true },
    );
}

export async function aggregateStats(): Promise<StatsResponse> {
  const db = _getDb();
  const knowledgeDocs = (await db
    .collection(Collections.Knowledge)
    .find({})
    .sort({ updatedAt: -1 })
    .toArray()) as unknown as KnowledgeDoc[];

  const statsDocs = (await db
    .collection(Collections.ProcessingStats)
    .find({})
    .sort({ updatedAt: -1 })
    .toArray()) as unknown as ProcessingStatsDoc[];

  const repos: StatsRepoEntry[] = [];
  for (const doc of knowledgeDocs) {
    const matchedStats = statsDocs.filter((s) => s.knowledgeId === doc.knowledgeId);
    const aggregate = aggregateRepoTokens(matchedStats);
    const fileCount = await db.collection(Collections.Raw).countDocuments({ knowledgeId: doc.knowledgeId });
    repos.push({
      knowledgeId: doc.knowledgeId,
      repoName: matchedStats[0]?.repoName ?? deriveRepoName(doc),
      type: doc.source.kind === "github" ? "GITHUB" : "LOCAL",
      fileCount,
      folderCount: 0,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      estimatedCost: aggregate.estimatedCost,
    });
  }

  const commitStats: StatsCommitEntry[] = statsDocs.map((s) => ({
    knowledgeId: s.knowledgeId,
    repoName: s.repoName,
    commitHash: s.commitHash,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    estimatedCost: s.estimatedCost,
    totalBatches: s.totalBatches,
    processingTimeMs: s.processingTimeMs,
    totalFiles: s.totalFiles,
    totalFolders: s.totalFolders,
    filesAnalyzed: s.filesAnalyzed,
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
  }));

  const totals: StatsTotals = {
    totalRepos: knowledgeDocs.length,
    totalFiles: repos.reduce((sum, r) => sum + r.fileCount, 0),
    totalFolders: 0,
    totalInputTokens: statsDocs.reduce((sum, s) => sum + (s.inputTokens ?? 0), 0),
    totalOutputTokens: statsDocs.reduce((sum, s) => sum + (s.outputTokens ?? 0), 0),
    totalEstimatedCost: sumCost(statsDocs.map((s) => s.estimatedCost)),
  };

  return { totals, repos, commitStats };
}

function sumModelTokens(modelTokens: ModelTokenBreakdown): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const usage of Object.values(modelTokens)) {
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
  }
  return { inputTokens, outputTokens };
}

function aggregateRepoTokens(stats: ProcessingStatsDoc[]): {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const s of stats) {
    inputTokens += s.inputTokens ?? 0;
    outputTokens += s.outputTokens ?? 0;
  }
  return {
    inputTokens,
    outputTokens,
    estimatedCost: sumCost(stats.map((s) => s.estimatedCost)),
  };
}

function sumCost(values: number[]): number {
  let total = 0;
  let anyKnown = false;
  for (const v of values) {
    if (typeof v !== "number" || v === COST_UNKNOWN) {
      continue;
    }
    anyKnown = true;
    total += v;
  }
  if (!anyKnown) {
    return values.length === 0 ? 0 : COST_UNKNOWN;
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

function deriveRepoName(doc: KnowledgeDoc): string {
  if (doc.source.kind === "local") {
    const segments = doc.source.sourcePath.split("/").filter((s) => s.length > 0);
    return segments.at(-1) ?? doc.source.sourcePath;
  }
  try {
    const segments = new URL(doc.source.repoUrl).pathname
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const repo = segments.at(-1)?.replace(/\.git$/u, "");
    const owner = segments.at(-2);
    if (owner !== undefined && repo !== undefined) {
      return `${owner}/${repo}`;
    }
  } catch {
    // fall through
  }
  return doc.source.repoUrl;
}

function toIso(value: Date | string | undefined): string {
  if (value === undefined) {
    return new Date(0).toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}
