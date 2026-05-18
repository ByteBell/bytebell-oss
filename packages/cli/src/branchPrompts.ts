import React from "react";
import { render } from "ink";
import { InitialBranchSelector, type InitialBranchResult } from "./InitialBranchSelector.tsx";
import { BranchSelector, type BranchSelectorResult } from "./BranchSelector.tsx";
import { ManualBranchPrompt, type ManualBranchPromptResult } from "./ManualBranchPrompt.tsx";

export async function promptInitialBranch(defaultBranch: string): Promise<"default" | "other" | null> {
  return new Promise<"default" | "other" | null>((resolve) => {
    const onDone = (result: InitialBranchResult): void => {
      if (result.choice !== undefined) {
        resolve(result.choice);
        return;
      }
      resolve(null);
    };
    const { waitUntilExit } = render(
      React.createElement(InitialBranchSelector, {
        defaultBranch,
        onDone,
      }),
    );
    waitUntilExit().catch(() => undefined);
  });
}

export async function promptFullBranchSelector(
  branches: string[],
): Promise<{ branch: string; manual: boolean } | null> {
  const result = await new Promise<BranchSelectorResult>((resolve) => {
    const onDone = (res: BranchSelectorResult): void => {
      resolve(res);
    };
    const { waitUntilExit } = render(
      React.createElement(BranchSelector, {
        branches,
        onDone,
      }),
    );
    waitUntilExit().catch(() => undefined);
  });

  if (result.cancelled) {
    return null;
  }
  if (result.typeManually) {
    const manual = await promptManualBranch();
    return manual ? { branch: manual, manual: true } : null;
  }
  if (result.branch) {
    return { branch: result.branch, manual: false };
  }
  return null;
}

async function promptManualBranch(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const onDone = (result: ManualBranchPromptResult): void => {
      if (result.branch !== undefined) {
        resolve(result.branch);
        return;
      }
      resolve(null);
    };
    const { waitUntilExit } = render(
      React.createElement(ManualBranchPrompt, {
        onDone,
      }),
    );
    waitUntilExit().catch(() => undefined);
  });
}
