import { runCypher } from "@bb/neo4j";
import type { ChannelName, ScoredHit } from "./smartSearchChannels.ts";

export interface FusedResult {
  path: string;
  knowledge_id: string;
  repo_name: string;
  score: number;
  matched_channels: ChannelName[];
  source_type: "code";
}

export interface Cluster {
  folder: string;
  repo_name: string;
  file_count: number;
  top_file: string;
}

export interface SmartSearchResult {
  query: string;
  channels_used: ChannelName[];
  total_matches: number;
  repos_matched: string[];
  top_results: FusedResult[];
  clusters: Cluster[];
}

const CHANNEL_WEIGHTS: Record<ChannelName, number> = {
  purpose: 0.3,
  paths: 0.2,
  keywords: 0.2,
  classes: 0.15,
  functions: 0.1,
  imports: 0.05,
};

export function fuseHits(perChannel: Record<ChannelName, ScoredHit[]>): Map<string, FusedResult> {
  const fused = new Map<string, FusedResult>();
  for (const channel of Object.keys(perChannel) as ChannelName[]) {
    const hits = perChannel[channel];
    if (hits.length === 0) {
      continue;
    }
    const max = Math.max(...hits.map((hit) => hit.score), 0);
    if (max === 0) {
      continue;
    }
    const weight = CHANNEL_WEIGHTS[channel];
    for (const hit of hits) {
      const key = `${hit.knowledgeId}::${hit.path}`;
      const normalized = (hit.score / max) * weight;
      const existing = fused.get(key);
      if (existing === undefined) {
        fused.set(key, {
          path: hit.path,
          knowledge_id: hit.knowledgeId,
          repo_name: "",
          score: normalized,
          matched_channels: [channel],
          source_type: "code",
        });
      } else {
        existing.score += normalized;
        if (!existing.matched_channels.includes(channel)) {
          existing.matched_channels.push(channel);
        }
      }
    }
  }
  return fused;
}

export async function attachRepoNames(results: FusedResult[]): Promise<void> {
  const ids = Array.from(new Set(results.map((row) => row.knowledge_id)));
  if (ids.length === 0) {
    return;
  }
  const rows = await runCypher<{ knowledgeId: string; repoName: string | null }>(
    `MATCH (k:Knowledge) WHERE k.knowledgeId IN $ids
     RETURN k.knowledgeId AS knowledgeId, k.repoName AS repoName`,
    { ids },
  );
  const lookup = new Map(rows.map((row) => [row.knowledgeId, row.repoName ?? ""]));
  for (const result of results) {
    result.repo_name = lookup.get(result.knowledge_id) ?? "";
  }
}

export function clusterByFolder(results: FusedResult[]): Cluster[] {
  const buckets = new Map<string, { folder: string; repo_name: string; files: FusedResult[] }>();
  for (const result of results) {
    const folder = topTwoSegments(result.path);
    const key = `${result.knowledge_id}::${folder}`;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { folder, repo_name: result.repo_name, files: [] };
      buckets.set(key, bucket);
    }
    bucket.files.push(result);
  }
  const clusters: Cluster[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.files.length < 2) {
      continue;
    }
    bucket.files.sort((a, b) => b.score - a.score);
    const head = bucket.files[0];
    if (head === undefined) {
      continue;
    }
    clusters.push({
      folder: bucket.folder,
      repo_name: bucket.repo_name,
      file_count: bucket.files.length,
      top_file: head.path,
    });
  }
  clusters.sort((a, b) => b.file_count - a.file_count);
  return clusters;
}

function topTwoSegments(relativePath: string): string {
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return relativePath;
  }
  return `${segments[0]}/${segments[1]}`;
}
