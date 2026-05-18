/**
 * Composes the user-side message for the analysis LLM call. Bundles the raw
 * business-context text, the pre-generated title, and (optional) enrichment
 * data extracted from the repository's meta-output. The enrichment section is
 * elided entirely when empty so the call works even before ingest-github has
 * produced any repo-summary.
 */
export function buildEnrichedUserMessage(text: string, title: string, enrichmentSection: string): string {
  const parts: string[] = [`TITLE (pre-generated):`, title, "", `BUSINESS CONTEXT TEXT (authored by a human):`, text];

  if (enrichmentSection.trim().length > 0) {
    parts.push("");
    parts.push("REPOSITORY ENRICHMENT (sampled from the indexed codebase):");
    parts.push(enrichmentSection);
  }

  return parts.join("\n");
}
