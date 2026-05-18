/**
 * Commit fetching from GitHub REST API.
 *
 * SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
 */

import { parseGithubRepo, USER_AGENT } from "./githubUrl.ts";

export interface CommitEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

export type FetchCommitsResult =
  | { status: "ok"; commits: CommitEntry[] }
  | { status: "not_found" }
  | { status: "unauthorized" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

const COMMITS_PAGE_SIZE = 100;

interface GithubCommitPayload {
  sha?: unknown;
  commit?: {
    message?: unknown;
    author?: { name?: unknown; date?: unknown } | null;
    committer?: { name?: unknown; date?: unknown } | null;
  };
}

/**
 * Fetches up to `limit` commits on `branch` via GitHub's REST API. The
 * server route uses this in place of `git log` against a shallow local
 * clone — the picker should not depend on clone state.
 *
 * Paginates over `/commits` (capped at 100 per page) until either `limit`
 * is reached or the upstream returns a short page. Unauthenticated calls
 * work for public repos; private repos answer 404 until a token is
 * supplied, at which point the CLI re-requests with `Authorization`.
 */
export async function fetchRecentCommits(
  repoUrl: string,
  branch: string,
  limit: number,
  gitToken?: string,
): Promise<FetchCommitsResult> {
  const parsed = parseGithubRepo(repoUrl);
  if (parsed === null) {
    return { status: "error", message: `unparseable github url: ${repoUrl}` };
  }
  if (limit <= 0) {
    return { status: "ok", commits: [] };
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (gitToken !== undefined && gitToken.length > 0) {
    headers["Authorization"] = `Bearer ${gitToken}`;
  }

  const collected: CommitEntry[] = [];
  let page = 1;
  while (collected.length < limit) {
    const remaining = limit - collected.length;
    const perPage = Math.min(COMMITS_PAGE_SIZE, remaining);
    const url =
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits` +
      `?sha=${encodeURIComponent(branch)}&per_page=${perPage}&page=${page}`;

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

    const payload = (await response.json()) as GithubCommitPayload[];
    if (!Array.isArray(payload) || payload.length === 0) {
      break;
    }
    for (const item of payload) {
      const entry = toCommitEntry(item);
      if (entry !== null) {
        collected.push(entry);
        if (collected.length >= limit) {
          break;
        }
      }
    }
    if (payload.length < perPage) {
      break;
    }
    page += 1;
  }

  return { status: "ok", commits: collected };
}

function toCommitEntry(raw: GithubCommitPayload): CommitEntry | null {
  const sha = raw.sha;
  if (typeof sha !== "string" || sha.length === 0) {
    return null;
  }
  const message = typeof raw.commit?.message === "string" ? raw.commit.message : "";
  const subjectLine = message.split("\n", 1)[0] ?? "";
  const authorName =
    typeof raw.commit?.author?.name === "string"
      ? raw.commit.author.name
      : typeof raw.commit?.committer?.name === "string"
        ? raw.commit.committer.name
        : "";
  const authorDate =
    typeof raw.commit?.author?.date === "string"
      ? raw.commit.author.date
      : typeof raw.commit?.committer?.date === "string"
        ? raw.commit.committer.date
        : "";
  return {
    hash: sha,
    shortHash: sha.slice(0, 7),
    subject: subjectLine,
    author: authorName,
    date: authorDate,
  };
}
