#!/usr/bin/env bun
import { Command } from "commander";
import { buildSetCommand } from "./SetCommand.ts";
import { error } from "./output.ts";

const VERSION = "0.0.0";

async function main(): Promise<void> {
  const program = new Command("bytebell");
  program.version(VERSION).description("Bytebell — local knowledge engine TUI");
  program.addCommand(buildSetCommand());
  await program.parseAsync(process.argv);
}

main().catch((cause: unknown) => {
  const msg = cause instanceof Error ? cause.message : String(cause);
  error(msg);
  process.exit(2);
});
