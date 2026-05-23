/**
 * LLM pricing table - dollars per 1M tokens, separated by input vs output.
 *
 * Used to backfill cost when the SDK didn't provide one. Best-effort - we'd
 * rather show $0 than reject an ingest call because a new model isn't in the
 * table. Update as providers publish new SKUs.
 */
export interface ModelPrice {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

const PRICING: Record<string, ModelPrice> = {
  // Anthropic
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },

  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },

  // Google
  'gemini-2.5-pro': { input: 1.25, output: 5 },
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },

  // Mistral
  'mistral-large': { input: 2, output: 6 },
  'mistral-small': { input: 0.2, output: 0.6 },
};

/**
 * Compute cost in USD for a generation. Returns null if model is unknown or
 * token counts are missing.
 */
export function computeCost(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  if (!model || inputTokens == null || outputTokens == null) return null;
  // Try exact model first, then strip dated suffix.
  let price = PRICING[model];
  if (!price) {
    const stripped = model.replace(/-\d{8}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
    price = PRICING[stripped];
  }
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
