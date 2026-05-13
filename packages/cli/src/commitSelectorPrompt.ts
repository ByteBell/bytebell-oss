import React from "react";
import { render } from "ink";
import { getJson } from "./httpClient.ts";
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
}

/**
 * Fetches commit history for a knowledge via `/api/v1/github/:id/commits`
 * and renders the searchable picker. Returns the chosen commit (full hash)
 * or `null` on cancel.
 */
export async function promptCommitSelector(opts: CommitPromptOptions): Promise<CommitSelectorItem | null> {
  const url = `/api/v1/github/${encodeURIComponent(opts.knowledgeId)}/commits?limit=${opts.limit ?? 200}`;
  const response = await getJson<CommitsResponse>(url);
  if (response.commits.length === 0) {
    return null;
  }
  const items: CommitSelectorItem[] = response.commits.map((c) => ({
    hash: c.hash,
    shortHash: c.shortHash,
    subject: c.subject,
    author: c.author,
    date: c.date,
  }));
  return await renderPicker(items, opts.title ?? `Pick a commit (origin/${response.branch})`);
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
