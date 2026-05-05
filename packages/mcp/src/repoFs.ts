import path from "node:path";
import { readFile } from "node:fs/promises";
import { getBytebellHome } from "@bb/config";

const REPOS_SUBDIR = "repos";

export class PathTraversalError extends Error {
  constructor(relativePath: string) {
    super(`Invalid relative path: ${relativePath} — path traversal or absolute path rejected.`);
    this.name = "PathTraversalError";
  }
}

export class FileReadError extends Error {
  constructor(relativePath: string, cause: unknown) {
    super(`Failed to read ${relativePath}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "FileReadError";
  }
}

export function resolveCloneDir(knowledgeId: string): string {
  return path.join(getBytebellHome(), REPOS_SUBDIR, knowledgeId);
}

export function resolveFilePath(knowledgeId: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/gu, "/");
  if (normalized.length === 0 || normalized.startsWith("/") || normalized.includes("..")) {
    throw new PathTraversalError(relativePath);
  }
  const cloneDir = resolveCloneDir(knowledgeId);
  const target = path.resolve(cloneDir, normalized);
  if (!target.startsWith(`${cloneDir}${path.sep}`) && target !== cloneDir) {
    throw new PathTraversalError(relativePath);
  }
  return target;
}

export async function readFileLines(knowledgeId: string, relativePath: string): Promise<string[]> {
  const target = resolveFilePath(knowledgeId, relativePath);
  let content: string;
  try {
    content = await readFile(target, "utf8");
  } catch (cause: unknown) {
    throw new FileReadError(relativePath, cause);
  }
  return content.split(/\r?\n/u);
}

export interface SliceOptions {
  fromLine: number;
  toLine: number;
}

export function sliceLines(lines: readonly string[], opts: SliceOptions): string[] {
  const from = Math.max(1, opts.fromLine);
  const to = Math.max(from, Math.min(lines.length, opts.toLine));
  return lines.slice(from - 1, to);
}

export function prefixWithLineNumbers(lines: readonly string[], startLine: number): string {
  const width = String(startLine + lines.length - 1).length;
  return lines.map((line, idx) => `${String(startLine + idx).padStart(width, " ")} | ${line}`).join("\n");
}
