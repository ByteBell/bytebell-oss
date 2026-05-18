import React from "react";
import { render } from "ink";
import { LsInteractive, type RepoEntry } from "./LsInteractive.tsx";

/**
 * Renders the interactive repository list and waits for the user to exit.
 */
export async function promptLsInteractive(repos: RepoEntry[]): Promise<void> {
  return new Promise<void>((resolve) => {
    const onDone = (): void => {
      resolve();
    };

    const { waitUntilExit } = render(
      React.createElement(LsInteractive, {
        repos,
        onDone,
      }),
    );

    waitUntilExit().catch(() => resolve());
  });
}
