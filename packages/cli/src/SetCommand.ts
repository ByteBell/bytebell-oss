import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { HINTS } from "@bb/config";
import { KEY_MAP, validKeysList } from "./keyMap.ts";
import { SetupForm } from "./SetupForm.tsx";
import { error, list, success } from "./output.ts";

export function buildSetCommand(): Command {
  const cmd = new Command("set");

  cmd
    .argument("[key]", `Configuration key to set (${validKeysList()})`)
    .argument("[value]", "New value for the key")
    .action(runSet);

  return cmd;
}

async function runSet(key?: string, value?: string): Promise<void> {
  if (key === undefined && value === undefined) {
    await runInteractive();
    return;
  }
  if (key === undefined || value === undefined) {
    error(`"set" requires both <key> and <value>, or no args (interactive form)`);
    process.exitCode = 1;
    return;
  }

  const mappedKey = KEY_MAP[key];
  if (!mappedKey) {
    error(`Invalid key: ${key}`);
    list("Valid keys:", Object.keys(KEY_MAP));
    process.exitCode = 1;
    return;
  }

  try {
    mappedKey.setter(value);
    success(`Set ${key} to ${value}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to set ${key}: ${message}`);
    const hint = HINTS[mappedKey.configKey];
    if (hint) {
      list("Hint:", [hint]);
    }
    process.exitCode = 1;
  }
}

async function runInteractive(): Promise<void> {
  return new Promise((resolve) => {
    const onDone = () => resolve();
    const { waitUntilExit } = render(React.createElement(SetupForm, { onDone }));
    waitUntilExit().catch(() => undefined);
  });
}
