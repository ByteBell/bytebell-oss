import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fail } from "./output.ts";
import { isInIndex, stagedBlobContent } from "./git.ts";

const MAX_SOURCE_LINES = 300;

function isFileSizeApplicable(path: string): boolean {
  if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.endsWith(".d.ts")) {
    return false;
  }
  return path.endsWith(".ts") || path.endsWith(".tsx");
}

export function checkFileSize(files: string[]): void {
  const offenders: Array<{ path: string; detail?: string }> = [];
  for (const p of files) {
    if (!isFileSizeApplicable(p)) {
      continue;
    }
    const content = stagedBlobContent(p);
    if (content === null) {
      continue;
    }
    const trimmed = content.endsWith("\n") ? content.slice(0, -1) : content;
    const lineCount = trimmed.length === 0 ? 0 : trimmed.split("\n").length;
    if (lineCount > MAX_SOURCE_LINES) {
      offenders.push({ path: p, detail: `${lineCount} lines` });
    }
  }
  if (offenders.length === 0) {
    return;
  }
  fail({
    name: `File size > ${MAX_SOURCE_LINES} lines`,
    rule: "Rule of File Size",
    files: offenders,
    fix: "Split into single-responsibility files before committing. See CLAUDE.md → Rule of File Size.",
  });
}

function packageRootOf(path: string): string | null {
  const parts = path.split("/");
  if (parts[0] !== "packages" || parts.length < 3) {
    return null;
  }
  return `packages/${parts[1]}`;
}

export function checkReadme(files: string[]): void {
  const required = new Set<string>();
  for (const p of files) {
    const pkgRoot = packageRootOf(p);
    if (!pkgRoot) {
      continue;
    }
    let dir = dirname(p);
    while (dir.startsWith(pkgRoot) || dir === pkgRoot) {
      required.add(`${dir}/README.md`);
      if (dir === pkgRoot) {
        break;
      }
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  const missing = [...required].filter((ctx) => !existsSync(ctx) && !isInIndex(ctx));
  if (missing.length === 0) {
    return;
  }
  fail({
    name: "Missing README.md",
    rule: "CLAUDE.md → Folder Context Rules",
    files: missing.map((p) => ({ path: p })),
    fix: "Every directory under packages/<pkg>/ containing code must have a README.md describing its contract.",
  });
}

export const MAX_LINES = MAX_SOURCE_LINES;
