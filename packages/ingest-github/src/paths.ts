import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getBytebellHome } from "@bb/config";

export function reposRoot(): string {
  return path.join(getBytebellHome(), "repos");
}

export function repoCloneDir(knowledgeId: string): string {
  return path.join(reposRoot(), knowledgeId);
}

export async function ensureReposRoot(): Promise<void> {
  await mkdir(reposRoot(), { recursive: true, mode: 0o700 });
}
