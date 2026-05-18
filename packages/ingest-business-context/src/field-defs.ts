/**
 * Single source of truth for the LLM analysis schema. Each entry defines a
 * field's expected type, the human-readable description shown to the LLM,
 * special instructions that constrain output, whether the field is requested
 * from the LLM (vs. populated by the pipeline), and an example value that
 * appears in the prompt template.
 *
 * Changing any value here propagates to the prompt builders and the validation
 * paths; nothing else needs to update.
 */
export interface BusinessContextFieldDef {
  type: string;
  description: string;
  special_instructions: string;
  requestedFromLLM: boolean;
  example: string;
}

const _FIELD_DEFS = {
  // ── Product People Fields ─────────────────────────────────────────────────

  title: {
    type: "string",
    description: "Concise, descriptive title for this business context entry",
    special_instructions:
      "Max 50 words. Should be immediately recognizable to a product manager scanning a list. No technical jargon.",
    requestedFromLLM: true,
    example: '"Stripe Payment Processing Integration"',
  },
  product_area: {
    type: "string",
    description: "Which product domain or area this context describes",
    special_instructions:
      "One or two words identifying the product area. Use standard product terminology. Empty string if unclear.",
    requestedFromLLM: true,
    example: '"Payments"',
  },
  user_stories: {
    type: "string[]",
    description: 'User needs this context addresses, each in "As a [role], I want [goal]" format',
    special_instructions:
      "Max 5 stories. Each must follow the As a / I want pattern. Derive from the text, do not invent needs not mentioned.",
    requestedFromLLM: true,
    example:
      '["As a customer, I want to pay with my saved card so checkout is faster", "As a finance team member, I want transaction reconciliation reports"]',
  },
  business_value: {
    type: "string",
    description: "What measurable value this provides to the business",
    special_instructions:
      "2-3 sentences max. Focus on revenue, cost, risk, or user satisfaction impact. No technical implementation details.",
    requestedFromLLM: true,
    example:
      '"Reduces checkout abandonment by 15% through one-click payments. Directly impacts monthly recurring revenue and customer retention metrics."',
  },
  stakeholders: {
    type: "string[]",
    description: "Roles or teams who care about this context",
    special_instructions:
      "Max 6 entries. Use role titles not individual names. Include both business and technical stakeholders mentioned or implied.",
    requestedFromLLM: true,
    example: '["Product Manager", "Payments Team", "Finance", "Customer Support"]',
  },
  success_metrics: {
    type: "string[]",
    description: "How success is measured for this business context",
    special_instructions:
      "Max 5 metrics. Each should be a measurable outcome, not a vague goal. Derive from text, infer reasonable metrics if not stated explicitly.",
    requestedFromLLM: true,
    example:
      '["Checkout conversion rate > 85%", "Payment processing latency < 2s", "Zero failed transactions due to integration errors"]',
  },
  user_impact: {
    type: "string",
    description: "How end users are affected, in plain language",
    special_instructions: "2-3 sentences. Describe the before/after for the end user. No technical jargon.",
    requestedFromLLM: true,
    example:
      '"Users can now complete purchases in under 30 seconds with saved payment methods. Previously, re-entering card details on every purchase caused significant drop-off."',
  },
  domain_keywords: {
    type: "string[]",
    description: "Business domain search terms for cross-repo discoverability",
    special_instructions:
      "Max 10 keywords. Business language only — no code identifiers. Think: what would a product person search for?",
    requestedFromLLM: true,
    example: '["payments", "checkout", "subscription", "billing", "revenue", "PCI compliance"]',
  },

  // ── Developer Fields ──────────────────────────────────────────────────────

  technical_summary: {
    type: "string",
    description: "What the code actually does at a technical level",
    special_instructions:
      "3-5 sentences. Include architecture pattern, key technologies, and data stores involved. This is for senior engineers.",
    requestedFromLLM: true,
    example:
      '"Implements a Stripe webhook handler using Express middleware that processes payment_intent events. Uses idempotency keys stored in Redis to prevent duplicate processing. Failed webhooks are retried via a BullMQ dead-letter queue with exponential backoff."',
  },
  affected_modules: {
    type: "string[]",
    description: "Which parts of the codebase are involved (folder paths or module names)",
    special_instructions:
      "Max 10 entries. Use folder-level paths (e.g., src/payments/) or module names. Derive from context, do not guess paths not mentioned.",
    requestedFromLLM: true,
    example: '["src/payments/", "src/webhooks/stripe/", "src/queue/workers/payment-processor"]',
  },
  architecture_decisions: {
    type: "string[]",
    description: 'Key technical choices, each as "Decision: X — Rationale: Y"',
    special_instructions:
      "Max 5 entries. Focus on decisions that would surprise a new developer or that have non-obvious rationale.",
    requestedFromLLM: true,
    example:
      '["Decision: Use webhook-based flow instead of polling — Rationale: Stripe recommends webhooks for reliability", "Decision: Redis idempotency keys with 24h TTL — Rationale: Stripe may retry webhooks for up to 24 hours"]',
  },
  dependencies: {
    type: "string[]",
    description: "Systems, services, or libraries this relies on",
    special_instructions:
      "Max 8 entries. Include both internal services and external dependencies. Format: 'name (type)' e.g., 'Stripe API (external)', 'Redis (cache)'.",
    requestedFromLLM: true,
    example: '["Stripe API (external)", "Redis (cache/idempotency)", "BullMQ (queue)", "PostgreSQL (transactions)"]',
  },
  risk_areas: {
    type: "string[]",
    description: "What could go wrong — known fragilities, operational concerns",
    special_instructions: "Max 5 entries. Be specific about failure modes. Include both technical and business risks.",
    requestedFromLLM: true,
    example:
      '["Stripe webhook signing secret rotation requires coordinated deploy", "Redis downtime causes duplicate payment processing"]',
  },
  data_flow: {
    type: "string",
    description: "How data moves through the system for this business context",
    special_instructions:
      "Describe the flow in plain English with arrow notation. Max 3-4 sentences. Include entry points, transforms, and storage.",
    requestedFromLLM: true,
    example:
      '"User submits payment → Stripe processes charge → Webhook hits /api/webhooks/stripe → Handler validates signature → Event queued in BullMQ → Worker updates order status in PostgreSQL → Confirmation email sent via SendGrid."',
  },
  api_surface: {
    type: "string[]",
    description: "APIs exposed or consumed",
    special_instructions:
      'Max 8 entries. Format exposed as "METHOD /path — description". Format consumed as "Consumes: service.endpoint — purpose".',
    requestedFromLLM: true,
    example:
      '["POST /api/webhooks/stripe — Receives Stripe webhook events", "GET /api/payments/:id — Retrieve payment status", "Consumes: Stripe PaymentIntents API — Create and confirm charges"]',
  },

  // ── Shared Fields ─────────────────────────────────────────────────────────

  summary: {
    type: "string",
    description: "2-3 sentence overview combining both business and technical perspectives",
    special_instructions:
      "First sentence: business context. Second sentence: technical approach. Optional third: key constraint or trade-off. Max 100 tokens.",
    requestedFromLLM: true,
    example:
      '"Enables one-click checkout by integrating Stripe payment processing with saved card tokens. Implemented as an event-driven pipeline using webhooks and BullMQ for reliable async processing. Designed for PCI compliance with zero card data touching our servers."',
  },
  keywords: {
    type: "string[]",
    description: "Searchable terms covering both business and technical vocabulary",
    special_instructions:
      "Max 15 keywords. Mix of business terms (from domain_keywords) and technical terms. No duplicates across domain_keywords and keywords.",
    requestedFromLLM: true,
    example: '["stripe", "webhook", "payment-intent", "idempotency", "BullMQ", "checkout", "PCI", "async-processing"]',
  },
} as const;

export const BUSINESS_CONTEXT_FIELD_DEFS: Record<string, BusinessContextFieldDef> = _FIELD_DEFS;

export const PRODUCT_FIELDS: readonly string[] = [
  "title",
  "product_area",
  "user_stories",
  "business_value",
  "stakeholders",
  "success_metrics",
  "user_impact",
  "domain_keywords",
];

export const TECHNICAL_FIELDS: readonly string[] = [
  "technical_summary",
  "affected_modules",
  "architecture_decisions",
  "dependencies",
  "risk_areas",
  "data_flow",
  "api_surface",
];

export const SHARED_FIELDS: readonly string[] = ["summary", "keywords"];

export const LLM_FIELD_NAMES: readonly string[] = Object.entries(_FIELD_DEFS)
  .filter(([, def]) => def.requestedFromLLM)
  .map(([name]) => name);

export const LLM_FIELD_NAME_SET: ReadonlySet<string> = new Set(LLM_FIELD_NAMES);
