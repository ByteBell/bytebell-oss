/**
 * Repository and branch information fetching from GitHub REST API.
 *
 * SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
 */

import { parseGithubRepo, USER_AGENT } from "./githubUrl.ts";

/**
 * Resolves the head SHA of `branch` on `repoUrl`. Returns `null` for any
 * non-2xx, parse failure, or unparsable URL — callers treat `null` as
 * "couldn't anchor, proceed without it".
 */
export async function fetchLatestCommitHash(
  repoUrl: string,
  branch: string,
  gitToken?: string,
): Promise<string | null> {
  const parsed = parseGithubRepo(repoUrl);
  if (parsed === null) {
    return null;
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (gitToken !== undefined && gitToken.length > 0) {
    headers["Authorization"] = `Bearer ${gitToken}`;
  }

  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { commit?: { sha?: unknown } };
  const sha = body.commit?.sha;
  return typeof sha === "string" && sha.length > 0 ? sha : null;
}

export type DefaultBranchResult =
  | { status: "ok"; branch: string }
  | { status: "not_found" }
  | { status: "unauthorized" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

/**
 * Fetches the default branch name of `repoUrl`. Returns a detailed result
 * so callers can distinguish between private repos, rate limits, and errors.
 */
export async function fetchDefaultBranch(repoUrl: string, gitToken?: string): Promise<DefaultBranchResult> {
  const parsed = parseGithubRepo(repoUrl);
  if (parsed === null) {
    return { status: "error", message: `unparseable github url: ${repoUrl}` };
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (gitToken !== undefined && gitToken.length > 0) {
    headers["Authorization"] = `Bearer ${gitToken}`;
  }

  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return { status: "error", message: `github fetch failed: ${msg}` };
  }

  if (response.status === 404) {
    return { status: "not_found" };
  }
  if (response.status === 401) {
    return { status: "unauthorized" };
  }
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    return { status: "rate_limited" };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { status: "error", message: `github ${response.status}: ${body.slice(0, 200)}` };
  }

  const body = (await response.json()) as { default_branch?: unknown };
  const branch = body.default_branch;
  if (typeof branch === "string" && branch.length > 0) {
    return { status: "ok", branch };
  }
  return { status: "error", message: "github API returned empty default_branch" };
}

/**
 * Fetches the list of branches for `repoUrl`.
 */
export async function fetchBranches(
  repoUrl: string,
  gitToken?: string,
  limit = 100,
): Promise<{ status: "ok"; branches: string[] } | { status: "error"; message: string }> {
  const parsed = parseGithubRepo(repoUrl);
  if (parsed === null) {
    return { status: "error", message: `unparseable github url: ${repoUrl}` };
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (gitToken !== undefined && gitToken.length > 0) {
    headers["Authorization"] = `Bearer ${gitToken}`;
  }

  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches?per_page=${limit}`;
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return { status: "error", message: `github fetch failed: ${msg}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { status: "error", message: `github ${response.status}: ${body.slice(0, 200)}` };
  }

  const body = (await response.json()) as Array<{ name?: unknown }>;
  const branches = body.map((b) => b.name).filter((name): name is string => typeof name === "string");
  return { status: "ok", branches };
}

export interface CommitEntry {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
}

export type FetchCommitsResult =
  | { status: "ok"; commits: CommitEntry[] }
  | { status: "not_found" }
  | { status: "unauthorized" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

/**
 * Fetches recent commits for a repository on a specific branch.
 */
export async function fetchRecentCommits(
  repoUrl: string,
  branch: string,
  limit = 10,
  gitToken?: string,
): Promise<FetchCommitsResult> {
  const parsed = parseGithubRepo(repoUrl);
  if (parsed === null) {
    return { status: "error", message: `unparseable github url: ${repoUrl}` };
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (gitToken !== undefined && gitToken.length > 0) {
    headers["Authorization"] = `Bearer ${gitToken}`;
  }

  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?per_page=${limit}&sha=${encodeURIComponent(branch)}`;
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return { status: "error", message: `github fetch failed: ${msg}` };
  }

  if (response.status === 404) {
    return { status: "not_found" };
  }
  if (response.status === 401) {
    return { status: "unauthorized" };
  }
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    return { status: "rate_limited" };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { status: "error", message: `github ${response.status}: ${body.slice(0, 200)}` };
  }

  const body = (await response.json()) as Array<{
    sha?: unknown;
    commit?: { message?: unknown; author?: { date?: unknown } };
    author?: { login?: unknown };
  }>;

  const commits = body
    .map((c) => {
      const sha = typeof c.sha === "string" ? c.sha : "";
      const message = typeof c.commit?.message === "string" ? c.commit.message : "";
      const author = typeof c.author?.login === "string" ? c.author.login : "";
      const timestamp = typeof c.commit?.author?.date === "string" ? c.commit.author.date : "";
      return { sha, message, author, timestamp };
    })
    .filter((c): c is CommitEntry => Boolean(c.sha && c.message));

  return { status: "ok", commits };
}

export { parseGithubRepo } from "./githubUrl.ts";
export type { ParsedRepo } from "./githubUrl.ts";
