import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getBytebellHome } from "@bb/config";
import type { MetaPaths } from "src/types/meta-paths.ts";

const DIR_MODE = 0o700;

export function reposRoot(): string {
  return path.join(getBytebellHome(), "repos");
}

export function repoCloneDir(knowledgeId: string): string {
  return path.join(reposRoot(), knowledgeId);
}

export async function ensureReposRoot(): Promise<void> {
  await mkdir(reposRoot(), { recursive: true, mode: DIR_MODE });
}

export function metaPathsFor(knowledgeId: string): MetaPaths {
  const metaRoot = path.join(reposRoot(), ".meta", knowledgeId);
  return {
    metaRoot,
    fileAnalysisDir: path.join(metaRoot, "file-analysis"),
    folderSummariesDir: path.join(metaRoot, "folder-summaries"),
    bigFileAnalysisDir: path.join(metaRoot, "big-file-analysis"),
    bigFileChunksDir: path.join(metaRoot, "big-file-analysis", "chunks"),
    bigFilesJson: path.join(metaRoot, "bigFiles.json"),
    repoSummaryJson: path.join(metaRoot, "repo-summary.json"),
  };
}

export async function ensureMetaDirs(paths: MetaPaths): Promise<void> {
  await mkdir(paths.fileAnalysisDir, { recursive: true, mode: DIR_MODE });
  await mkdir(paths.folderSummariesDir, { recursive: true, mode: DIR_MODE });
  await mkdir(paths.bigFileAnalysisDir, { recursive: true, mode: DIR_MODE });
  await mkdir(paths.bigFileChunksDir, { recursive: true, mode: DIR_MODE });
}

const SLASH_RE = /\//gu;
const BACKSLASH_RE = /\\/gu;
const ENCODED_SLASH_RE = /__SL__/gu;
const ENCODED_BACKSLASH_RE = /__BS__/gu;

export function encodeMetaPath(relativePath: string): string {
  return relativePath.replace(SLASH_RE, "__SL__").replace(BACKSLASH_RE, "__BS__");
}

export function decodeMetaPath(encoded: string): string {
  return encoded.replace(ENCODED_SLASH_RE, "/").replace(ENCODED_BACKSLASH_RE, "\\");
}
