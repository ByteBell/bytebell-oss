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
    .description("Write a value to ~/.bytebell/config.json. With no args, opens the interactive setup form.")
    .argument("[key]", "config key (e.g. mongo, neo4j, redis, port)")
    .argument("[value]", "value to write")
    .action(runSet);
  return cmd;
}

async function runSet(key: string | undefined, value: string | undefined): Promise<void> {
  if (key === undefined && value === undefined) {
    await runInteractive();
    return;
  }
  if (key === undefined || value === undefined) {
    error(`"set" requires both <key> and <value>, or no args (interactive form)`);
    process.exitCode = 1;
    return;
  }
  runHeadless(key, value);
}

function runHeadless(key: string, value: string): void {
  const entry = KEY_MAP[key];
  if (entry === undefined) {
    error(`Unknown key "${key}"`);
    list(`Valid keys:`, validKeysList());
    process.exitCode = 1;
    return;
  }
  try {
    entry.setter(value);
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    error(msg, HINTS[entry.configKey]);
    process.exitCode = 1;
    return;
  }
  const display = entry.redact ? "<redacted>" : value;
  success(`Set ${entry.configKey} = ${display}`);
}

async function runInteractive(): Promise<void> {
  await new Promise<void>((resolve) => {
    const onDone = (result: { saved: boolean; error?: string }): void => {
      if (result.saved) {
        success("Configuration saved.");
      }
      resolve();
    };
    const { waitUntilExit } = render(React.createElement(SetupForm, { onDone }));
    waitUntilExit().catch(() => undefined);
  });
}
