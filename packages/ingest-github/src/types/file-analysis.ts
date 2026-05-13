import type { FileAnalysis } from "@bb/mongo";

export const FALLBACK_LANGUAGE = "unknown";

export function emptyFileAnalysis(): FileAnalysis {
  return {
    purpose: "",
    summary: "",
    businessContext: "",
    classes: [],
    functions: [],
    importsInternal: [],
    importsExternal: [],
    keywords: [],
  };
}
