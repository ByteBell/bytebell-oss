/**
 * Minimal GitHub REST helpers used by the pull flow.
 *
 * Public repo only models GitHub (no Bitbucket), so this stays small —
 * a URL parser and a single branch-head lookup. Both are best-effort:
 * `null` on parse failure or non-2xx so callers can fall back without
 * try/catch noise.
 */

const USER_AGENT = "ByteBell";

export interface ParsedRepo {
  owner: string;
  repo: string;
}

/** Parses `https://github.com/{owner}/{repo}(.git)?(/...)?` → `{owner, repo}`. */
export function parseGithubRepo(repoUrl: string): ParsedRepo | null {
  if (!repoUrl) {
    return null;
  }
  try {
    const url = new URL(repoUrl);
    if (!url.hostname.endsWith("github.com")) {
      return null;
    }
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    if (segments.length < 2) {
      return null;
    }
    const owner = segments[0];
    const repoRaw = segments[1];
    if (owner === undefined || repoRaw === undefined) {
      return null;
    }
    return { owner, repo: repoRaw.replace(/\.git$/u, "") };
  } catch {
    return null;
  }
}

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
