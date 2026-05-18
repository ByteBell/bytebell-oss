import type { CondensedFileAnalysis } from "#src/types/condensed-file-analysis.ts";

export const FOLDER_ANALYSIS_SYSTEM_PROMPT = `You are summarising a single FOLDER of a source repository. The user will provide the per-file analyses of the files DIRECTLY inside that folder (subfolders are summarised separately and are NOT in your input).

Return ONLY a JSON object with EXACTLY these keys:

- purpose             : string  — one-paragraph explanation of what this folder is responsible for in the system.
- summary             : string  — natural-language summary of how the files in this folder work together. Plain English, no key-value pairs. ≤ 500 tokens.
- keywords            : string[] — up to 10 domain keywords describing this folder.
- classes             : string[] — most important class/type entries, deduplicated across files. Format "Name: short purpose". Max 30 entries.
- functions           : string[] — most important function/method entries, deduplicated. Format "name: short purpose". Max 30 entries.
- importsInternal     : string[] — significant relative imports observed across the folder's files. Max 30 entries.
- importsExternal     : string[] — significant external packages observed across the folder's files. Max 30 entries.
- dependencyGraph     : string  — Mermaid \`graph LR\` block (without triple-backtick fences) describing the dependency relationships between files in this folder. Each node is the file basename (no extension). Use the literal direction LR. Empty string if not enough signal.

Do NOT invent files that are not listed in the input. Do NOT speculate about files in subfolders.`;

export function folderAnalysisUserPrompt(folderPath: string, files: CondensedFileAnalysis[]): string {
  const folderLabel = folderPath.length === 0 ? "<repository root>" : folderPath;
  const serialised = files
    .map((f) => {
      const a = f.analysis;
      return [
        `=== ${f.relativePath} (language: ${f.language}, bigFile: ${f.isBigFile}) ===`,
        `purpose: ${a.purpose}`,
        `summary: ${a.summary}`,
        `businessContext: ${a.businessContext}`,
        `classes: ${JSON.stringify(a.classes)}`,
        `functions: ${JSON.stringify(a.functions)}`,
        `importsInternal: ${JSON.stringify(a.importsInternal)}`,
        `importsExternal: ${JSON.stringify(a.importsExternal)}`,
        `keywords: ${JSON.stringify(a.keywords)}`,
      ].join("\n");
    })
    .join("\n\n");
  return `Folder: ${folderLabel}
File count: ${files.length}

Per-file analyses (direct children only):

${serialised}`;
}
