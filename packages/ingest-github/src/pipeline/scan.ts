import { opendir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import { SKIP_DIRS, looksBinary, passesPathFilters } from "./filters.ts";
import type { ScanEntry } from "src/types/pipeline.ts";

interface ScanLimits {
  absoluteCap: number;
  bigFileLineThreshold: number;
}

export async function* scanRepository(rootDir: string): AsyncGenerator<ScanEntry> {
  const limits: ScanLimits = {
    absoluteCap: getConfigValue(Config.AbsoluteFileSizeCap),
    bigFileLineThreshold: getConfigValue(Config.BigFileLineThreshold),
  };
  yield* walk(rootDir, rootDir, limits);
}

async function* walk(rootDir: string, currentDir: string, limits: ScanLimits): AsyncGenerator<ScanEntry> {
  const dir = await opendir(currentDir);
  for await (const entry of dir) {
    const abs = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      yield* walk(rootDir, abs, limits);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!passesPathFilters(entry.name, path.extname(entry.name))) {
      continue;
    }
    const sizeBytes = (await stat(abs)).size;
    const relativePath = path.relative(rootDir, abs);
    if (sizeBytes > limits.absoluteCap) {
      yield { kind: "oversized", relativePath, absolutePath: abs, sizeBytes };
      continue;
    }
    const buf = await readFile(abs);
    if (looksBinary(buf)) {
      continue;
    }
    const content = buf.toString("utf8");
    if (countLines(content) > limits.bigFileLineThreshold) {
      yield { kind: "oversized", relativePath, absolutePath: abs, sizeBytes };
      continue;
    }
    yield {
      kind: "file",
      relativePath,
      absolutePath: abs,
      sizeBytes,
      content,
    };
  }
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  let lines = 1;
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) {
      lines += 1;
    }
  }
  return lines;
}

export async function readScannedFile(absolutePath: string): Promise<string> {
  return await readFile(absolutePath, "utf8");
}
