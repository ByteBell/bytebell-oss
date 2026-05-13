import React from "react";
import { render } from "ink";
import { getJson, HttpClientError } from "./httpClient.ts";
import { CommitSelector, type CommitSelectorItem, type CommitSelectorResult } from "./CommitSelector.tsx";

interface CommitsResponse {
  knowledgeId: string;
  branch: string;
  commits: Array<{
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    date: string;
  }>;
}

export interface CommitPromptOptions {
  knowledgeId: string;
  limit?: number;
  title?: string;
  gitToken?: string;
}

export type CommitPromptResult =
  | { kind: "picked"; commit: CommitSelectorItem }
  | { kind: "cancelled" }
  | { kind: "needs_token" }
  | { kind: "unauthorized" }
  | { kind: "empty" };

/**
 * Fetches commit history for a knowledge via `/api/v1/github/:id/commits`
 * and renders the searchable picker. Returns a discriminated result so the
 * caller can distinguish "user cancelled" from "private repo, prompt for
 * token" from "supplied token was rejected".
 */
export async function promptCommitSelector(opts: CommitPromptOptions): Promise<CommitPromptResult> {
  const url = `/api/v1/github/${encodeURIComponent(opts.knowledgeId)}/commits?limit=${opts.limit ?? 200}`;
  const headers: Record<string, string> = {};
  if (opts.gitToken !== undefined && opts.gitToken.length > 0) {
    headers["Authorization"] = `Bearer ${opts.gitToken}`;
  }

  let response: CommitsResponse;
  try {
    response = await getJson<CommitsResponse>(url, { headers });
  } catch (cause: unknown) {
    if (cause instanceof HttpClientError) {
      if (cause.status === 404) {
        return { kind: "needs_token" };
      }
      if (cause.status === 401) {
        return { kind: "unauthorized" };
      }
    }
    throw cause;
  }

  if (response.commits.length === 0) {
    return { kind: "empty" };
  }

  const items: CommitSelectorItem[] = response.commits.map((c) => ({
    hash: c.hash,
    shortHash: c.shortHash,
    subject: c.subject,
    author: c.author,
    date: c.date,
  }));
  const picked = await renderPicker(items, opts.title ?? `Pick a commit (origin/${response.branch})`);
  if (picked === null) {
    return { kind: "cancelled" };
  }
  return { kind: "picked", commit: picked };
}

async function renderPicker(items: CommitSelectorItem[], title: string): Promise<CommitSelectorItem | null> {
  return new Promise<CommitSelectorItem | null>((resolve) => {
    const onDone = (result: CommitSelectorResult): void => {
      resolve(result.picked ?? null);
    };
    const { waitUntilExit } = render(
      React.createElement(CommitSelector, {
        items,
        title,
        onDone,
      }),
    );
    waitUntilExit().catch(() => undefined);
  });
}
