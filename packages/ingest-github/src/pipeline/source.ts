import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import path from "node:path";
import { GitCloneError } from "@bb/errors";

const exec = promisify(execFile);

export interface SyncRepositoryInput {
  repoUrl: string;
  branch: string;
  destinationDir: string;
  gitToken?: string;
}

export async function syncRepository(input: SyncRepositoryInput): Promise<void> {
  const authedUrl = applyToken(input.repoUrl, input.gitToken);
  if (await isGitRepo(input.destinationDir)) {
    await fetchAndReset(input.destinationDir, authedUrl, input.branch, input.repoUrl);
    return;
  }
  try {
    await exec("git", [
      "clone",
      "--depth=1",
      "--single-branch",
      "--branch",
      input.branch,
      authedUrl,
      input.destinationDir,
    ]);
  } catch (cause: unknown) {
    throw new GitCloneError(input.repoUrl, cause);
  }
}

export async function readHeadCommitHash(repoDir: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-C", repoDir, "rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const s = await stat(path.join(dir, ".git"));
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fetchAndReset(dir: string, authedUrl: string, branch: string, displayUrl: string): Promise<void> {
  try {
    await exec("git", ["-C", dir, "remote", "set-url", "origin", authedUrl]);
    await exec("git", ["-C", dir, "fetch", "--depth=1", "origin", branch]);
    await exec("git", ["-C", dir, "reset", "--hard", `origin/${branch}`]);
  } catch (cause: unknown) {
    throw new GitCloneError(displayUrl, cause);
  }
}

function applyToken(repoUrl: string, gitToken: string | undefined): string {
  if (gitToken === undefined || gitToken.length === 0) {
    return repoUrl;
  }
  const parsed = new URL(repoUrl);
  parsed.username = gitToken;
  parsed.password = "x-oauth-basic";
  return parsed.toString();
}
