import type { GithubIndexPayload } from "@bb/types";
import { IngestError } from "@bb/errors";
import { fetchDefaultBranch } from "src/githubApi.ts";

const DEFAULT_BRANCH = "main";

export async function resolveBranch(
  knowledgeId: string,
  payload: GithubIndexPayload,
  gitToken?: string,
): Promise<string> {
  const branch = payload.branch;
  if (branch !== undefined && branch.length > 0) {
    if (!/^[\w./-]+$/u.test(branch)) {
      throw new IngestError(knowledgeId, `invalid branch name: ${branch}`);
    }
    return branch;
  }

  // No branch provided -> attempt to fetch the default branch from GitHub.
  try {
    const result = await fetchDefaultBranch(payload.repoUrl, gitToken);
    if (result.status === "ok") {
      return result.branch;
    }
  } catch {
    // Best-effort; fall back to the hardcoded default.
  }

  return DEFAULT_BRANCH;
}
