/**
 * Joins an array into a single delimited string for storage on a Neo4j property
 * that we want full-text indexable. Empty values are skipped; empty input
 * returns "".
 */
export function serializeArrayForNeo4j(values: readonly string[]): string {
  return values.filter((v) => typeof v === "string" && v.trim().length > 0).join(" | ");
}
