import { createHash } from "node:crypto";
import { tokenLen } from "@bb/llm";
import type { CondensedFileAnalysis } from "src/types/condensed-file-analysis.ts";
import type { FileAnalyzer, ScannedFile } from "src/types/pipeline.ts";

export async function analyseScannedFile(analyzer: FileAnalyzer, file: ScannedFile): Promise<CondensedFileAnalysis> {
  const { language, analysis } = await analyzer.analyze({
    relativePath: file.relativePath,
    content: file.content,
  });
  return {
    relativePath: file.relativePath,
    language,
    sha256: sha256(file.content),
    sizeBytes: file.sizeBytes,
    tokenCount: tokenLen(file.content),
    isBigFile: false,
    totalChunks: 0,
    totalTokenCount: 0,
    analysedAt: new Date().toISOString(),
    analysis,
  };
}

export function buildOversizedStub(relativePath: string, sizeBytes: number): CondensedFileAnalysis {
  return {
    relativePath,
    language: "unknown",
    sha256: "",
    sizeBytes,
    tokenCount: 0,
    isBigFile: true,
    totalChunks: 0,
    totalTokenCount: 0,
    analysedAt: new Date().toISOString(),
    analysis: {
      purpose: "",
      summary: "Skipped: file exceeds the absolute size cap.",
      businessContext: "",
      classes: [],
      functions: [],
      importsInternal: [],
      importsExternal: [],
      keywords: [],
    },
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
