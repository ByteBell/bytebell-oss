import type { FileAnalysis } from "@bb/mongo";

export { tokenLen } from "@bb/llm";

export const FALLBACK_LANGUAGE = "unknown";
export const BIG_FILE_TOKEN_THRESHOLD = 12_000;
export const MAX_TOKENS_PER_CHUNK = 6_000;
export const CONDENSE_CONTEXT_LIMIT = 12_000;
export const CONDENSE_PROMPT_OVERHEAD = 1_500;
export const SMALL_FILE_DEDUP_THRESHOLD = 3;

export const FILE_ANALYSIS_FIELDS_BLOCK = `- purpose          : string  — Authoritative explanation of why this file exists and how it fits in the system. No speculation, no roadmap, no invented intent. Return empty string only if purpose cannot be inferred. Max ~300 tokens.
- summary          : string  — Natural language summary of the file's purpose, key patterns, architecture role, and important concepts for search and developer comprehension. Plain English paragraph. NO JSON, NO key-value pairs. Cover: what the file does, why it exists, key design patterns or algorithms, and how it fits in the system. Do NOT duplicate class/function names verbatim. Max 600 tokens.
- businessContext  : string  — Short paragraph (2-3 lines) describing the business/product domain this file serves, why it matters, and what breaks if it fails. Focus on business language, not technical implementation. Max ~100 tokens. Empty string if no business context can be inferred.
- language         : string  — Lowercase canonical name of any programming, markup, config, or data language identifiable from the contents (e.g. typescript, python, go, dockerfile, markdown, terraform, graphql). Return "unknown" if you cannot identify the language with confidence — do not guess generic labels like "text" or "plain".
- classes          : string[] — Every structural/type definition in the file (classes, interfaces, enums, structs, unions, traits, etc.). Format: "ExactName (~L3-29): What it represents or controls". 8-15 words per entry. Exact names from source code, preserve original casing.
- functions        : string[] — Every function/method/procedure/callable definition in the file. Format: "exact_name (~L3-29): Primary responsibility". 8-15 words per entry. Exact names from source code, preserve original casing.
- importsInternal  : string[] — Relative imports only (./ or ../). Exact paths as written.
- importsExternal  : string[] — External packages or standard libraries only. Package names only (no paths).
- keywords         : string[] — Up to 10 technical domain keywords or short phrases for AI-powered search. Focus on: technologies, frameworks, domain concepts, algorithms, patterns, protocols. Use natural casing. No generic terms like "code", "file", "function".`;

export interface ParsedFileAnalysis {
  language: string;
  analysis: FileAnalysis;
}

export function emptyAnalysis(): FileAnalysis {
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

export function tryParse(raw: string): Record<string, unknown> | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/```\s*$/u, "");
  try {
    const value: unknown = JSON.parse(trimmed);
    if (typeof value === "object" && value !== null) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return null;
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
    }
  }
  return out;
}

export function parseFileAnalysisJson(parsed: Record<string, unknown>): ParsedFileAnalysis {
  const parsedLang = parsed["language"];
  const parsedPurpose = parsed["purpose"];
  const parsedSummary = parsed["summary"];
  const parsedBusinessContext = parsed["businessContext"];
  return {
    language: typeof parsedLang === "string" && parsedLang.length > 0 ? parsedLang : FALLBACK_LANGUAGE,
    analysis: {
      purpose: typeof parsedPurpose === "string" ? parsedPurpose : "",
      summary: typeof parsedSummary === "string" ? parsedSummary : "",
      businessContext: typeof parsedBusinessContext === "string" ? parsedBusinessContext : "",
      classes: stringArray(parsed["classes"]),
      functions: stringArray(parsed["functions"]),
      importsInternal: stringArray(parsed["importsInternal"]),
      importsExternal: stringArray(parsed["importsExternal"]),
      keywords: stringArray(parsed["keywords"]),
    },
  };
}
