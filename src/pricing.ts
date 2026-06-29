/**
 * Token cost calculation — convert tokenUsage counts to USD spend.
 *
 * Why this matters:
 *   - Operators have no way to know how much the bridge is costing without
 *     this. Logs show "12000 tokens" but mean nothing without a price tag.
 *   - The /stats endpoint surfaces this so a Grafana/Promtail scrape or a
 *     quick `curl` shows real cost in real time.
 *
 * Pricing source: official Anthropic + OpenAI published rates (Jan 2026).
 * If a model isn't listed, we mark it unknown and cost is reported as null.
 *
 * Override via env (per-million-token prices in USD):
 *   CTI_PRICE_<MODEL>_INPUT
 *   CTI_PRICE_<MODEL>_OUTPUT
 * Example:
 *   CTI_PRICE_claude-sonnet-4-5_INPUT=3
 *   CTI_PRICE_claude-sonnet-4-5_OUTPUT=15
 *
 * Cache reads are usually 0.1x input price (Anthropic) or 0.5x (OpenAI).
 * We model this as a separate cache_read rate when known.
 */

export interface ModelPrice {
  inputPerMTok: number;       // USD per 1M input tokens
  outputPerMTok: number;      // USD per 1M output tokens
  cacheReadPerMTok?: number;  // USD per 1M cache-read tokens (Anthropic/OAI)
  cacheWritePerMTok?: number; // USD per 1M cache-write tokens (Anthropic only)
}

// Source: Anthropic pricing (https://docs.anthropic.com/en/docs/about-claude/pricing)
//   + OpenAI pricing (https://openai.com/api/pricing/). Snapshot 2026-01.
const DEFAULT_PRICES: Record<string, ModelPrice> = {
  // ── Anthropic Claude ──
  'claude-opus-4-5':     { inputPerMTok: 15,  outputPerMTok: 75,  cacheReadPerMTok: 1.5,  cacheWritePerMTok: 18.75 },
  'claude-sonnet-4-5':   { inputPerMTok: 3,   outputPerMTok: 15,  cacheReadPerMTok: 0.3,  cacheWritePerMTok: 3.75 },
  'claude-sonnet-4':     { inputPerMTok: 3,   outputPerMTok: 15,  cacheReadPerMTok: 0.3,  cacheWritePerMTok: 3.75 },
  'claude-haiku-4-5':    { inputPerMTok: 1,   outputPerMTok: 5,   cacheReadPerMTok: 0.1,  cacheWritePerMTok: 1.25 },
  'claude-haiku-3-5':    { inputPerMTok: 0.8, outputPerMTok: 4,   cacheReadPerMTok: 0.08, cacheWritePerMTok: 1 },
  // ── OpenAI ──
  'gpt-4o':              { inputPerMTok: 2.5, outputPerMTok: 10,  cacheReadPerMTok: 1.25 },
  'gpt-4o-mini':         { inputPerMTok: 0.15, outputPerMTok: 0.6, cacheReadPerMTok: 0.075 },
  'o1':                  { inputPerMTok: 15,  outputPerMTok: 60,  cacheReadPerMTok: 7.5 },
  'o1-mini':             { inputPerMTok: 3,   outputPerMTok: 12,  cacheReadPerMTok: 1.5 },
  'o3':                  { inputPerMTok: 10,  outputPerMTok: 40,  cacheReadPerMTok: 5 },
  'o3-mini':             { inputPerMTok: 1.1, outputPerMTok: 4.4, cacheReadPerMTok: 0.55 },
  // ── OpenAI Codex / GPT-5 family (newer models) ──
  'codex':               { inputPerMTok: 5,   outputPerMTok: 20,  cacheReadPerMTok: 2.5 },
  'gpt-5':               { inputPerMTok: 5,   outputPerMTok: 20,  cacheReadPerMTok: 2.5 },
  'gpt-5-mini':          { inputPerMTok: 0.5, outputPerMTok: 2,   cacheReadPerMTok: 0.25 },
};

/** Resolve price for a model name. Falls back to env overrides, then to null. */
export function getModelPrice(model: string | undefined | null): ModelPrice | null {
  if (!model) return null;
  const normalized = model.toLowerCase().trim();

  // Direct lookup
  if (DEFAULT_PRICES[normalized]) return DEFAULT_PRICES[normalized];

  // Fuzzy match (e.g. "claude-sonnet-4-5-20250929" → "claude-sonnet-4-5")
  for (const key of Object.keys(DEFAULT_PRICES)) {
    if (normalized.startsWith(key) || normalized.includes(key)) {
      return DEFAULT_PRICES[key];
    }
  }

  // Env override: CTI_PRICE_<sanitized>_INPUT / _OUTPUT
  const envKey = normalized.replace(/[^a-z0-9-]/g, '-').toUpperCase();
  const inputOverride = parseFloat(process.env[`CTI_PRICE_${envKey}_INPUT`] || '');
  const outputOverride = parseFloat(process.env[`CTI_PRICE_${envKey}_OUTPUT`] || '');
  if (Number.isFinite(inputOverride) && Number.isFinite(outputOverride)) {
    return { inputPerMTok: inputOverride, outputPerMTok: outputOverride };
  }

  return null;
}

export interface TokenUsageInput {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface CostResult {
  model: string;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  currency: 'USD';
  isKnown: boolean;  // false when model isn't priced — totalCost stays 0
}

/**
 * Compute USD cost for a single TokenUsage event.
 * If the model is unknown, returns totalCost=0 with isKnown=false.
 */
export function computeCost(model: string | undefined | null, usage: TokenUsageInput | null | undefined): CostResult {
  const empty = { model: model || 'unknown', inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, totalCost: 0, currency: 'USD' as const, isKnown: false };
  if (!usage) return empty;
  const price = getModelPrice(model);
  if (!price) return { ...empty, model: model || 'unknown' };
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const inputCost = (input / 1_000_000) * price.inputPerMTok;
  const outputCost = (output / 1_000_000) * price.outputPerMTok;
  const cacheReadCost = ((price.cacheReadPerMTok || 0) / 1_000_000) * cacheRead;
  const cacheWriteCost = ((price.cacheWritePerMTok || 0) / 1_000_000) * cacheWrite;
  return {
    model: model || 'unknown',
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    currency: 'USD',
    isKnown: true,
  };
}

export type { ModelPrice as ModelPriceType };