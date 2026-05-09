import { Command } from "commander";
import React from "react";
import { exec } from "node:child_process";
import { render } from "ink";
import { HINTS, getConfigValue } from "@bb/config";
import { Config } from "@bb/types";
import { KEY_MAP, validKeysList } from "./keyMap.ts";
import { SetupForm } from "./SetupForm.tsx";
import { error, list, success, info } from "./output.ts";

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
  if (key === "config" && value === undefined) {
    await openWebEditor();
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

async function openWebEditor(): Promise<void> {
  const port = getConfigValue(Config.ServerPort);
  const url = `http://127.0.0.1:${port}/config`;

  info(`Opening configuration editor in browser...`);
  info(url);

  const platform = process.platform;
  const command =
    platform === "darwin" ? `open "${url}"` : platform === "win32" ? `start "${url}"` : `xdg-open "${url}"`;

  exec(command, (err) => {
    if (err) {
      error(`Failed to open browser. Please visit the URL manually.`);
    }
  });
}
