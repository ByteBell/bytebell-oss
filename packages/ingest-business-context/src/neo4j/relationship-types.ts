/**
 * Maps each array-valued field in `BusinessContextAnalysis` to the typed
 * relationship name connecting an `:OrgKeyword` to its parent
 * `:BusinessContext`. Edge label is fixed (`:APPEARS_IN_BUSINESS_CONTEXT`);
 * the `type` property on the `:OrgKeyword` node carries the relationship
 * class so queries can filter by stakeholder vs. risk vs. dependency etc.
 */
export const BUSINESS_CONTEXT_KEYWORD_TYPES: Readonly<Record<string, string>> = {
  domain_keywords: "HAS_DOMAIN_KEYWORD",
  keywords: "HAS_KEYWORD",
  stakeholders: "HAS_STAKEHOLDER",
  affected_modules: "HAS_AFFECTED_MODULE",
  risk_areas: "HAS_RISK_AREA",
  api_surface: "HAS_API_SURFACE",
  dependencies: "HAS_DEPENDENCY",
  user_stories: "HAS_USER_STORY",
  success_metrics: "HAS_SUCCESS_METRIC",
  architecture_decisions: "HAS_ARCHITECTURE_DECISION",
};
