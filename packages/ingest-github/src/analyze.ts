import path from "node:path";
import { askLLM } from "@bb/llm";
import type { FileAnalysis } from "@bb/mongo";

const MAX_CONTENT_CHARS = 60_000;

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".scala": "scala",
  ".clj": "clojure",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".ml": "ocaml",
  ".vue": "vue",
  ".svelte": "svelte",
  ".md": "markdown",
  ".mdx": "markdown",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".sql": "sql",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".dockerfile": "dockerfile",
};

export interface AnalyzedFile {
  language: string;
  analysis: FileAnalysis;
}

export async function analyzeFile(relativePath: string, content: string): Promise<AnalyzedFile> {
  const language = languageFromPath(relativePath);
  const truncated = content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) : content;
  const prompt = buildPrompt(relativePath, truncated);

  let raw: string;
  try {
    raw = await askLLM(prompt);
  } catch {
    return { language, analysis: emptyAnalysis() };
  }

  const parsed = tryParse(raw);
  if (parsed === null) {
    return { language, analysis: emptyAnalysis() };
  }

  const parsedLang = parsed["language"];
  const parsedPurpose = parsed["purpose"];
  const parsedSummary = parsed["summary"];
  return {
    language: typeof parsedLang === "string" && parsedLang.length > 0 ? parsedLang : language,
    analysis: {
      purpose: typeof parsedPurpose === "string" ? parsedPurpose : "",
      summary: typeof parsedSummary === "string" ? parsedSummary : "",
      classes: stringArray(parsed["classes"]),
      functions: stringArray(parsed["functions"]),
      imports: stringArray(parsed["imports"]),
      keywords: stringArray(parsed["keywords"]),
    },
  };
}

function buildPrompt(relativePath: string, content: string): string {
  return `You are analyzing a single source file for a code knowledge graph.
Return ONLY a JSON object, no prose, no markdown fences, with EXACTLY these keys:

- purpose   : string  — <= 30 words, why this file exists
- summary   : string  — <= 80 words, plain-English description of contents
- language  : string  — lowercase canonical name (typescript, python, go, markdown, ...)
- classes   : string[] — each item: "ClassName (~Lstart-end): one-line responsibility". Empty array if none.
- functions : string[] — each item: "func_name (~Lstart-end): one-line responsibility". Top-level only; do not list methods of classes already listed above. Empty array if none.
- imports   : string[] — module identifiers as written in source (e.g. "express", "./routes/users", "node:fs/promises"). Empty array if none.
- keywords  : string[] — up to 10 technical/domain keywords. Lowercase, no generic words like "code" or "file".

Do not invent line ranges — derive from the actual content.

File path: ${relativePath}
File content:
${content}`;
}

function tryParse(raw: string): Record<string, unknown> | null {
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

function stringArray(value: unknown): string[] {
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

function emptyAnalysis(): FileAnalysis {
  return { purpose: "", summary: "", classes: [], functions: [], imports: [], keywords: [] };
}

function languageFromPath(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  const lang = EXTENSION_LANGUAGE[ext];
  if (lang !== undefined) {
    return lang;
  }
  if (path.basename(relativePath).toLowerCase() === "dockerfile") {
    return "dockerfile";
  }
  return "plaintext";
}
