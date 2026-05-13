export const BACKFILL_SYSTEM_PROMPT = `You are filling in missing analysis fields for a single source file based on its existing per-file analysis. Return ONLY a JSON object with EXACTLY these keys (any may be empty if not inferable):

- keywords            : string[]
- sideEffects         : string[]
- configDependencies  : string[]
- dataFlowDirection   : string  // "inbound" | "outbound" | "internal" | "bidirectional" | ""`;

export function buildBackfillUserPrompt(
  relativePath: string,
  analysis: {
    purpose?: string;
    summary?: string;
    classes?: string[];
    functions?: string[];
    importsInternal?: string[];
    importsExternal?: string[];
  },
): string {
  return `File: ${relativePath}
purpose: ${analysis.purpose ?? ""}
summary: ${analysis.summary ?? ""}
classes: ${JSON.stringify(analysis.classes ?? [])}
functions: ${JSON.stringify(analysis.functions ?? [])}
importsInternal: ${JSON.stringify(analysis.importsInternal ?? [])}
importsExternal: ${JSON.stringify(analysis.importsExternal ?? [])}`;
}
