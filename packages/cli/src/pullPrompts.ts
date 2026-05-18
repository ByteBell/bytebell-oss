import React from "react";
import { render } from "ink";
import { error, info } from "./output.ts";
import { promptCommitSelector, type CommitPromptResult } from "./commitSelectorPrompt.ts";
import { PullModeSelector, type PullModeSelectorResult } from "./PullModeSelector.tsx";
import { TokenPrompt, type TokenPromptResult } from "./TokenPrompt.tsx";

export interface ResolvedCommit {
  hash: string;
  token: string | undefined;
}

/**
 * Renders the commit picker, transparently handling private-repo 404s by
 * prompting for a GitHub PAT and retrying once. Returns the chosen commit
 * (plus the token if one was collected) or `null` on cancel / empty / repeated
 * auth failure.
 */
export async function resolveCommit(
  knowledgeId: string,
  repoLabel: string,
  existingToken: string | undefined,
): Promise<ResolvedCommit | null> {
  let token = existingToken;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const opts: Parameters<typeof promptCommitSelector>[0] = { knowledgeId };
    if (token !== undefined) {
      opts.gitToken = token;
    }
    const result: CommitPromptResult = await promptCommitSelector(opts);

    if (result.kind === "picked") {
      return { hash: result.commit.hash, token };
    }
    if (result.kind === "cancelled") {
      return null;
    }
    if (result.kind === "empty") {
      info(`No commits returned for ${repoLabel}.`);
      return null;
    }
    if (result.kind === "needs_token" || result.kind === "unauthorized") {
      if (attempt === 1) {
        error(
          result.kind === "unauthorized"
            ? `GitHub rejected the token for ${repoLabel}.`
            : `Still no access to ${repoLabel} after supplying a token.`,
        );
        return null;
      }
      const promptMessage =
        result.kind === "unauthorized"
          ? "The previous token was rejected. Try a different PAT."
          : "This repo looks private. Paste a GitHub PAT with `repo` scope.";
      const tokenResult = await promptForToken(repoLabel, promptMessage);
      if (tokenResult === null) {
        info("Cancelled.");
        return null;
      }
      token = tokenResult;
    }
  }
  return null;
}

export async function promptForToken(repoLabel: string, message: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const onDone = (result: TokenPromptResult): void => {
      if (result.token !== undefined && result.token.length > 0) {
        resolve(result.token);
        return;
      }
      resolve(null);
    };
    const { waitUntilExit } = render(
      React.createElement(TokenPrompt, {
        repoLabel,
        message,
        onDone,
      }),
    );
    waitUntilExit().catch(() => undefined);
  });
}

export async function promptPullMode(repoLabel: string): Promise<"latest" | "specific" | null> {
  return new Promise<"latest" | "specific" | null>((resolve) => {
    const onDone = (result: PullModeSelectorResult): void => {
      if (result.mode !== undefined) {
        resolve(result.mode);
        return;
      }
      resolve(null);
    };
    const { waitUntilExit } = render(
      React.createElement(PullModeSelector, {
        repoLabel,
        onDone,
      }),
    );
    waitUntilExit().catch(() => undefined);
  });
}
