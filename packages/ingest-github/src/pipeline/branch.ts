import type { GithubIndexPayload } from "@bb/types";
import { IngestError } from "@bb/errors";

const DEFAULT_BRANCH = "main";

export function resolveBranch(knowledgeId: string, payload: GithubIndexPayload): string {
  const branch = payload.branch;
  if (branch === undefined || branch.length === 0) {
    return DEFAULT_BRANCH;
  }
  if (!/^[\w./-]+$/u.test(branch)) {
    throw new IngestError(knowledgeId, `invalid branch name: ${branch}`);
  }
  return branch;
}
