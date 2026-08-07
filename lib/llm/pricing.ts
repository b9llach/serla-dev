/**
 * LLM cost computation.
 *
 * Prices come from `model-prices.json`, a snapshot merged from LiteLLM (the
 * canonical provider-native price map) and the OpenRouter catalog (which
 * adds hundreds of aggregator/community models and usually lists brand-new
 * releases first). ~4000 models. Regenerate with `npm run pricing:sync`.
 *
 * Why a snapshot rather than a live fetch: cost computation runs on the
 * ingest hot path, so it must not depend on a third-party host being up.
 *
 * Values in the JSON are USD per 1M tokens as `[input, output]`. An output
 * price of 0 is meaningful - embeddings and rerankers only charge for input,
 * and some catalog models are genuinely free.
 */

import priceData from './model-prices.json';

type PriceTuple = [input: number, output: number];

const PRICES = priceData.prices as unknown as Record<string, PriceTuple>;

export interface ModelPrice {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/**
 * Resolve a model name to its price, tolerating the naming variations
 * providers and SDKs actually emit:
 *
 *   "gpt-4o"                        exact
 *   "openai/gpt-4o"                 provider-prefixed (OpenRouter, LiteLLM)
 *   "anthropic:claude-sonnet-4-5"   colon-separated prefix
 *   "gpt-4o-2024-11-20"             dated snapshot
 *   "GPT-4o"                        wrong case
 *
 * Returns null when the model is genuinely unknown, so callers can surface
 * "unpriced" instead of silently reporting $0.
 */
export function lookupModelPrice(model: string): ModelPrice | null {
  if (!model) return null;

  const candidates: string[] = [];
  const push = (s: string) => {
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  const raw = model.trim();
  push(raw);
  push(raw.toLowerCase());

  // Strip a provider prefix: "openai/gpt-4o" or "anthropic:claude-...".
  const afterSlash = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : '';
  const afterColon = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : '';
  push(afterSlash);
  push(afterSlash.toLowerCase());
  push(afterColon);
  push(afterColon.toLowerCase());

  // Strip a trailing dated snapshot: -2024-11-20 or -20241120.
  for (const base of [raw, afterSlash, afterColon].filter(Boolean)) {
    push(base.replace(/-\d{4}-\d{2}-\d{2}$/, ''));
    push(base.replace(/-\d{8}$/, ''));
    push(base.replace(/-\d{4}-\d{2}-\d{2}$/, '').toLowerCase());
    push(base.replace(/-\d{8}$/, '').toLowerCase());
    // "-latest" aliases.
    push(base.replace(/-latest$/, ''));
    push(base.replace(/-latest$/, '').toLowerCase());
  }

  for (const c of candidates) {
    const hit = PRICES[c];
    if (hit) return { input: hit[0], output: hit[1] };
  }
  return null;
}

/** True when we have pricing for this model. */
export function isModelPriced(model: string): boolean {
  return lookupModelPrice(model) !== null;
}

/**
 * Compute cost in USD for a generation. Returns null when the model is
 * unknown or token counts are missing - the caller stores NULL rather than
 * 0 so unpriced generations are distinguishable from genuinely free ones.
 */
export function computeCost(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  if (inputTokens == null || outputTokens == null) return null;
  const price = lookupModelPrice(model);
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Number of models in the bundled price table - surfaced in the dashboard. */
export const PRICED_MODEL_COUNT = Object.keys(PRICES).length;
