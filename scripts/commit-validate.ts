#!/usr/bin/env bun
import { stagedFiles } from "./lib/git.ts";
import { BOLD, DIM, GREEN, RESET, ok } from "./lib/output.ts";
import { checkLargeFiles, checkLockfiles, checkMergeMarkers, checkWhitespaceAndEof } from "./lib/checks-staged.ts";
import { MAX_LINES, checkReadme, checkFileSize } from "./lib/checks-rules.ts";
import { checkSecrets, runLintStaged } from "./lib/checks-tools.ts";

function main(): void {
  const files = stagedFiles();
  if (files.length === 0) {
    console.log(`${DIM}No staged files. Skipping pre-commit checks.${RESET}`);
    return;
  }
  const plural = files.length === 1 ? "" : "s";
  console.log(`${BOLD}Pre-commit${RESET} ${DIM}(${files.length} staged file${plural})${RESET}`);

  checkLockfiles(files);
  ok("lockfile guard");

  checkLargeFiles(files);
  ok("large file blocker");

  checkMergeMarkers(files);
  ok("merge conflict markers");

  checkWhitespaceAndEof(files);
  ok("trailing whitespace + EOF newline");

  checkFileSize(files);
  ok(`file size ≤ ${MAX_LINES} lines`);

  checkReadme(files);
  ok("README.md presence");

  checkSecrets();
  ok("secrets scan");

  console.log("");
  console.log(`${BOLD}lint-staged${RESET}`);
  runLintStaged();

  console.log("");
  console.log(`${GREEN}${BOLD}✓ pre-commit passed${RESET}`);
}

main();
