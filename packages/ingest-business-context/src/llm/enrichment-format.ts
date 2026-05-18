import { tokenLen } from "@bb/llm";
import { logger } from "@bb/logger";
import type { EnrichmentData, KeywordCount } from "#src/llm/enrichment-reader.ts";

const MAX_ENRICHMENT_TOKENS = 15_000;

export type EnrichmentFocus = "product" | "technical" | "shared";

function formatEntries(entries: readonly KeywordCount[]): string {
  return entries.map((e) => `  ${e.keyword} (${e.count})`).join("\n");
}

function appendProductSection(enrichment: EnrichmentData, sections: string[]): void {
  if (enrichment.topKeywords.length > 0) {
    sections.push(`TOP REPOSITORY KEYWORDS (by frequency):\n${formatEntries(enrichment.topKeywords)}`);
  }
  if (enrichment.topBusinessEntities.length > 0) {
    sections.push(`TOP BUSINESS ENTITIES:\n${formatEntries(enrichment.topBusinessEntities)}`);
  }
  if (enrichment.topOntologyConcepts.length > 0) {
    sections.push(`TOP ONTOLOGY CONCEPTS:\n${formatEntries(enrichment.topOntologyConcepts)}`);
  }
  if (enrichment.majorSubsystems.length > 0) {
    const lines = enrichment.majorSubsystems.map((s) => `  ${s.name}: ${s.responsibility}`).join("\n");
    sections.push(`MAJOR SUBSYSTEMS:\n${lines}`);
  }
}

function appendTechnicalSection(enrichment: EnrichmentData, sections: string[]): void {
  if (enrichment.repoArchitecture.length > 0) {
    sections.push(`REPOSITORY ARCHITECTURE:\n${enrichment.repoArchitecture}`);
  }
  if (enrichment.repoDataFlow.length > 0) {
    sections.push(`DATA FLOW:\n${enrichment.repoDataFlow}`);
  }
  if (enrichment.repoKeyPatterns.length > 0) {
    sections.push(`KEY PATTERNS:\n  ${enrichment.repoKeyPatterns.join(", ")}`);
  }
  if (enrichment.integrationSurface.length > 0) {
    sections.push(`INTEGRATION SURFACE:\n${formatEntries(enrichment.integrationSurface)}`);
  }
  if (enrichment.contractsProvided.length > 0) {
    sections.push(`CONTRACTS PROVIDED:\n${formatEntries(enrichment.contractsProvided)}`);
  }
  if (enrichment.contractsConsumed.length > 0) {
    sections.push(`CONTRACTS CONSUMED:\n${formatEntries(enrichment.contractsConsumed)}`);
  }
  if (enrichment.sideEffects.length > 0) {
    sections.push(`SIDE EFFECTS:\n${formatEntries(enrichment.sideEffects)}`);
  }
  if (enrichment.configDependencies.length > 0) {
    sections.push(`CONFIG DEPENDENCIES:\n${formatEntries(enrichment.configDependencies)}`);
  }
  if (enrichment.topSystemCapabilities.length > 0) {
    sections.push(`SYSTEM CAPABILITIES:\n${formatEntries(enrichment.topSystemCapabilities)}`);
  }
}

/**
 * Renders the enrichment data into a string targeted at a specific LLM call.
 * Product call sees business entities and concepts; technical call sees
 * architecture, contracts, side effects; shared call sees both.
 *
 * Output is capped at `MAX_ENRICHMENT_TOKENS` — over budget, truncated
 * proportionally. Empty enrichment returns an empty string and the user-message
 * composer elides the section entirely.
 */
export function buildEnrichmentSection(enrichment: EnrichmentData, focus: EnrichmentFocus): string {
  const sections: string[] = [];
  if (focus === "product" || focus === "shared") {
    appendProductSection(enrichment, sections);
  }
  if (focus === "technical" || focus === "shared") {
    appendTechnicalSection(enrichment, sections);
  }
  const full = sections.join("\n\n");
  if (full.length === 0) {
    return "";
  }

  const tokens = tokenLen(full);
  if (tokens > MAX_ENRICHMENT_TOKENS) {
    logger.info(`business-context: enrichment (${focus}) ${tokens} tokens > cap ${MAX_ENRICHMENT_TOKENS}; truncating`);
    const ratio = MAX_ENRICHMENT_TOKENS / tokens;
    return full.slice(0, Math.floor(full.length * ratio));
  }
  return full;
}
