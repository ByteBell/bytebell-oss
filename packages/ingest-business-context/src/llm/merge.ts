import type { BusinessContextAnalysis } from "#src/types.ts";

function takeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function takeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Merges three partial analysis blobs (product, technical, shared) into a
 * single fully-populated `BusinessContextAnalysis`. Missing fields default to
 * empty values. The pre-generated `title` is used as the final fallback if
 * the product call did not emit one.
 */
export function mergeAnalysisFields(merged: Record<string, unknown>, fallbackTitle: string): BusinessContextAnalysis {
  return {
    title: takeString(merged["title"], fallbackTitle),
    product_area: takeString(merged["product_area"]),
    user_stories: takeStringArray(merged["user_stories"]),
    business_value: takeString(merged["business_value"]),
    stakeholders: takeStringArray(merged["stakeholders"]),
    success_metrics: takeStringArray(merged["success_metrics"]),
    user_impact: takeString(merged["user_impact"]),
    domain_keywords: takeStringArray(merged["domain_keywords"]),
    technical_summary: takeString(merged["technical_summary"]),
    affected_modules: takeStringArray(merged["affected_modules"]),
    architecture_decisions: takeStringArray(merged["architecture_decisions"]),
    dependencies: takeStringArray(merged["dependencies"]),
    risk_areas: takeStringArray(merged["risk_areas"]),
    data_flow: takeString(merged["data_flow"]),
    api_surface: takeStringArray(merged["api_surface"]),
    summary: takeString(merged["summary"]),
    keywords: takeStringArray(merged["keywords"]),
  };
}
