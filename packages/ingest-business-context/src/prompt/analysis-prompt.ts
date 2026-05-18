import { BUSINESS_CONTEXT_FIELD_DEFS } from "#src/field-defs.ts";

/**
 * Builds a system prompt asking the LLM to fill exactly the requested field
 * subset (a slice of the full 16-field schema). Each call in the parallel
 * pipeline targets one subset (product, technical, shared) so total context
 * stays under budget and the JSON outputs are small enough to parse reliably.
 *
 * The prompt emits a JSON template that lists only the requested fields with
 * their descriptions, special instructions, and an example value drawn from
 * `BUSINESS_CONTEXT_FIELD_DEFS`. The LLM is asked to populate every key.
 */
export function buildPartialAnalysisPrompt(requestedFields: readonly string[]): string {
  const fieldBlocks: string[] = [];
  for (const name of requestedFields) {
    const def = BUSINESS_CONTEXT_FIELD_DEFS[name];
    if (!def) {
      continue;
    }
    fieldBlocks.push(
      `  "${name}": ${def.example}\n    // type: ${def.type}\n    // description: ${def.description}\n    // instructions: ${def.special_instructions}`,
    );
  }

  return `You are an analyst combining business context with technical understanding of an indexed codebase.

The user provides:
  1. Raw business-context text describing why a commit exists.
  2. A pre-generated title for context.
  3. (Optional) Aggregated enrichment data sampled from the repository (top keywords, architecture
     summary, file tree, integration surface). Use these as evidence to ground your output; do not
     invent claims that conflict with them.

Your task: extract the following fields, populating EVERY key. If a field cannot be derived from
the text or enrichment, output an empty string or empty array — never null or undefined.

Output format (strict JSON, no markdown fences, no commentary):

{
${fieldBlocks.join(",\n")}
}

Rules:
- Honour every "instructions" line literally — they cap list lengths and dictate tone.
- Do not echo the field descriptions or instructions in your output.
- Do not introduce extra top-level keys beyond those listed.
- Output ONE JSON object. Nothing else.`;
}
