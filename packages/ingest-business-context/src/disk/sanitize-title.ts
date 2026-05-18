const NON_ALNUM_DASH = /[^a-z0-9\s-]/gu;
const WHITESPACE_RUN = /\s+/gu;
const DASH_RUN = /-{2,}/gu;
const LEADING_OR_TRAILING_DASH = /^-|-$/gu;

/**
 * Converts an LLM-generated title into a filesystem-safe, URL-safe slug.
 *
 * Lowercase. Non-alphanumerics collapse to single hyphens. Capped at 80 chars
 * so the resulting directory name is comfortably under filesystem limits on
 * every platform. Used as both the on-disk directory name and the Neo4j
 * `nodeId` — two BC submissions whose LLM titles sanitise to the same slug
 * MERGE onto the same `:BusinessContext` node (by design — same idea, same
 * node).
 */
export function sanitizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(NON_ALNUM_DASH, "")
    .replace(WHITESPACE_RUN, "-")
    .replace(DASH_RUN, "-")
    .replace(LEADING_OR_TRAILING_DASH, "")
    .slice(0, 80)
    .replace(/-$/u, "");
}
