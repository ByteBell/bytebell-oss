import { opendir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import type { AskLlmOptions } from "@bb/llm";
import { logger } from "@bb/logger";
import { SKIP_DIRS, looksBinary, passesPathFilters } from "./filters.ts";
import type { ScanEntry, SkipDecider } from "#src/types/pipeline.ts";

interface ScanLimits {
  absoluteCap: number;
  bigFileLineThreshold: number;
}

export interface ScanRepositoryDeps {
  skipDecider?: SkipDecider;
  llmCallContext?: AskLlmOptions;
}

export async function* scanRepository(rootDir: string, deps: ScanRepositoryDeps = {}): AsyncGenerator<ScanEntry> {
  const limits: ScanLimits = {
    absoluteCap: getConfigValue(Config.AbsoluteFileSizeCap),
    bigFileLineThreshold: getConfigValue(Config.BigFileLineThreshold),
  };
  const counts = { acceptStatic: 0, acceptLlm: 0, rejectStatic: 0, rejectLlm: 0, oversized: 0, binary: 0 };
  yield* walk(rootDir, rootDir, limits, deps, counts);
  logger.info(
    `scan: acceptStatic=${counts.acceptStatic} acceptLlm=${counts.acceptLlm} rejectStatic=${counts.rejectStatic} rejectLlm=${counts.rejectLlm} oversized=${counts.oversized} binary=${counts.binary}`,
  );
}

interface ScanCounts {
  acceptStatic: number;
  acceptLlm: number;
  rejectStatic: number;
  rejectLlm: number;
  oversized: number;
  binary: number;
}

async function* walk(
  rootDir: string,
  currentDir: string,
  limits: ScanLimits,
  deps: ScanRepositoryDeps,
  counts: ScanCounts,
): AsyncGenerator<ScanEntry> {
  const dir = await opendir(currentDir);
  for await (const entry of dir) {
    const abs = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      yield* walk(rootDir, abs, limits, deps, counts);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!passesPathFilters(entry.name, path.extname(entry.name))) {
      counts.rejectStatic += 1;
      continue;
    }
    const sizeBytes = (await stat(abs)).size;
    const relativePath = path.relative(rootDir, abs);
    const ext = path.extname(entry.name).toLowerCase();
    if (sizeBytes > limits.absoluteCap) {
      counts.oversized += 1;
      yield { kind: "oversized", relativePath, absolutePath: abs, sizeBytes };
      continue;
    }
    const buf = await readFile(abs);
    if (looksBinary(buf)) {
      counts.binary += 1;
      continue;
    }
    const content = buf.toString("utf8");
    if (countLines(content) > limits.bigFileLineThreshold) {
      counts.oversized += 1;
      yield { kind: "oversized", relativePath, absolutePath: abs, sizeBytes };
      continue;
    }
    if (deps.skipDecider !== undefined) {
      const deciderInput: Parameters<typeof deps.skipDecider.decide>[0] = { relativePath, absolutePath: abs, ext };
      if (deps.llmCallContext !== undefined) {
        deciderInput.llmCallContext = deps.llmCallContext;
      }
      const decision = await deps.skipDecider.decide(deciderInput);
      if (decision === "reject-static") {
        counts.rejectStatic += 1;
        continue;
      }
      if (decision === "reject-llm") {
        counts.rejectLlm += 1;
        continue;
      }
      if (decision === "accept-llm") {
        counts.acceptLlm += 1;
      } else {
        counts.acceptStatic += 1;
      }
    } else {
      counts.acceptStatic += 1;
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
