import type { ModelTokenBreakdown } from "@bb/types";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const PRICING_TIMEOUT_MS = 8_000;
const COST_UNKNOWN = -1;

interface OpenRouterPricing {
  prompt?: string;
  completion?: string;
}

interface OpenRouterModel {
  id?: string;
  pricing?: OpenRouterPricing;
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

interface ModelPrice {
  inputUsdPerToken: number;
  outputUsdPerToken: number;
}

let pricingCache: Map<string, ModelPrice> | null = null;
let pricingPromise: Promise<Map<string, ModelPrice>> | null = null;

async function fetchPricing(): Promise<Map<string, ModelPrice>> {
  const map = new Map<string, ModelPrice>();
  let response: Response;
  try {
    response = await fetch(OPENROUTER_MODELS_URL, {
      signal: AbortSignal.timeout(PRICING_TIMEOUT_MS),
    });
  } catch {
    return map;
  }
  if (!response.ok) {
    return map;
  }
  const json = (await response.json().catch(() => null)) as OpenRouterModelsResponse | null;
  if (json === null || !Array.isArray(json.data)) {
    return map;
  }
  for (const entry of json.data) {
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      continue;
    }
    const promptStr = entry.pricing?.prompt;
    const completionStr = entry.pricing?.completion;
    const inputPrice = typeof promptStr === "string" ? Number.parseFloat(promptStr) : Number.NaN;
    const outputPrice = typeof completionStr === "string" ? Number.parseFloat(completionStr) : Number.NaN;
    if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice)) {
      continue;
    }
    map.set(entry.id, { inputUsdPerToken: inputPrice, outputUsdPerToken: outputPrice });
  }
  return map;
}

async function getPricing(): Promise<Map<string, ModelPrice>> {
  if (pricingCache !== null) {
    return pricingCache;
  }
  if (pricingPromise === null) {
    pricingPromise = fetchPricing().then((map) => {
      pricingCache = map;
      return map;
    });
  }
  return pricingPromise;
}

function resolvePrice(prices: Map<string, ModelPrice>, model: string): ModelPrice | undefined {
  const direct = prices.get(model);
  if (direct !== undefined) {
    return direct;
  }
  for (const [id, price] of prices.entries()) {
    if (id.endsWith(`/${model}`) || model.endsWith(`/${id}`)) {
      return price;
    }
  }
  return undefined;
}

export async function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): Promise<number> {
  const prices = await getPricing();
  if (prices.size === 0) {
    return COST_UNKNOWN;
  }
  const price = resolvePrice(prices, model);
  if (price === undefined) {
    return COST_UNKNOWN;
  }
  const cost = inputTokens * price.inputUsdPerToken + outputTokens * price.outputUsdPerToken;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function estimateCostFromBreakdown(modelTokens: ModelTokenBreakdown): Promise<number> {
  const entries = Object.entries(modelTokens);
  if (entries.length === 0) {
    return 0;
  }
  let total = 0;
  let anyKnown = false;
  for (const [model, usage] of entries) {
    const cost = await estimateCostUsd(model, usage.inputTokens, usage.outputTokens);
    if (cost === COST_UNKNOWN) {
      continue;
    }
    anyKnown = true;
    total += cost;
  }
  if (!anyKnown) {
    return COST_UNKNOWN;
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

export function _resetPricingForTests(): void {
  pricingCache = null;
  pricingPromise = null;
}
