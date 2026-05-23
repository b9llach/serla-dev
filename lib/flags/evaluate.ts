/**
 * Feature flag evaluation.
 *
 * Stable: same (distinct_id, flag_key) always returns the same result, so a
 * user doesn't see the flag flip on every page load when the rollout
 * percentage is mid-rollout.
 *
 * Order:
 *   1. If flag.enabled is false  -> off.
 *   2. If any condition matches the user -> on (variant if multivariate).
 *   3. Else if rollout % covers this user -> on.
 *   4. Else -> off.
 */

import { createHash } from 'crypto';
import type { FeatureFlag } from '@/lib/db/schema';

export interface FlagEvalContext {
  distinctId: string;
  properties?: Record<string, unknown>;
}

export interface FlagEvalResult {
  /** Boolean OR string variant key (for multivariate flags). false = flag is off. */
  value: boolean | string;
  /** Why the flag resolved this way - for debugging. */
  reason: 'disabled' | 'condition_match' | 'rollout' | 'rollout_excluded';
}

interface Condition {
  type: string;
  field?: string;
  value?: unknown;
  values?: unknown[];
}

interface Variant {
  key: string;
  weight: number;
}

/** Deterministic 0-100 hash bucket for (key, id). */
function bucketFor(flagKey: string, distinctId: string): number {
  const hash = createHash('sha256').update(`${flagKey}:${distinctId}`).digest();
  // Use the first 4 bytes as a uint32 and modulo to 0-9999 for two-decimal precision.
  const n = hash.readUInt32BE(0);
  return (n % 10000) / 100;
}

function matchesCondition(
  condition: Condition,
  ctx: FlagEvalContext,
): boolean {
  if (condition.type === 'distinct_id_in' && Array.isArray(condition.values)) {
    return condition.values.includes(ctx.distinctId);
  }
  if (condition.type === 'property_equals' && condition.field) {
    const propValue = ctx.properties?.[condition.field];
    return propValue === condition.value;
  }
  return false;
}

function pickVariant(variants: Variant[], flagKey: string, distinctId: string): string | null {
  if (variants.length === 0) return null;
  const bucket = bucketFor(`${flagKey}:variant`, distinctId);
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) return variant.key;
  }
  return variants[variants.length - 1]!.key;
}

export function evaluateFlag(
  flag: FeatureFlag,
  ctx: FlagEvalContext,
): FlagEvalResult {
  if (!flag.enabled) {
    return { value: false, reason: 'disabled' };
  }

  const variants = (flag.variants as Variant[]) || [];
  const conditions = (flag.conditions as Condition[]) || [];

  // Conditions: any-match wins.
  const matched = conditions.some(c => matchesCondition(c, ctx));
  if (matched) {
    const variant = variants.length > 0 ? pickVariant(variants, flag.key, ctx.distinctId) : null;
    return { value: variant ?? true, reason: 'condition_match' };
  }

  // Rollout %.
  const bucket = bucketFor(flag.key, ctx.distinctId);
  if (bucket < flag.rolloutPercentage) {
    const variant = variants.length > 0 ? pickVariant(variants, flag.key, ctx.distinctId) : null;
    return { value: variant ?? true, reason: 'rollout' };
  }

  return { value: false, reason: 'rollout_excluded' };
}
