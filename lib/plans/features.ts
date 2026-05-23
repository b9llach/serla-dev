/**
 * Single source of truth for what plan unlocks which feature.
 * Imported by both the client-side <FeatureGate /> and server-side billing
 * helpers - keep it as a plain TS module (no React, no Node-specific code).
 *
 * Pricing philosophy:
 *  - Free is "try before you pay" - basic analytics only, hard caps.
 *  - Hobby ($9.99) is the developer wedge - every product feature is unlocked.
 *    Devs hit the paywall when they outgrow limits, not when they reach for
 *    a feature their teammate showed them.
 *  - Pro raises limits (events, retention, projects) and adds programmatic
 *    data-export. Same feature set as Hobby, just bigger.
 *  - Max removes caps entirely and adds enterprise touches.
 */

export type PlanId = 'free' | 'hobby' | 'pro' | 'max';

export const PLAN_ORDER: PlanId[] = ['free', 'hobby', 'pro', 'max'];

export const PLAN_NAMES: Record<PlanId, string> = {
  free: 'Free',
  hobby: 'Hobby',
  pro: 'Pro',
  max: 'Max',
};

/**
 * featureAccess[feature] = list of plans that include the feature.
 *
 * Keys here are referenced by:
 *   - components/dashboard/feature-gate.tsx (<FeatureGate feature="..." />)
 *   - components/dashboard/sidebar.tsx (per-nav-item gating)
 *   - server actions that need to gate creation server-side
 *
 * When adding a new feature, prefer including it on hobby+ unless it's
 * genuinely expensive to run (storage/bandwidth heavy).
 */
export const FEATURE_ACCESS: Record<string, PlanId[]> = {
  // Everyone gets basic analytics so the Free tier feels usable, not crippled.
  basicAnalytics: ['free', 'hobby', 'pro', 'max'],

  // Hobby+ - every product feature unlocked. The "$9.99 = the whole suite" pitch.
  advancedAnalytics: ['hobby', 'pro', 'max'],
  goals: ['hobby', 'pro', 'max'],
  funnels: ['hobby', 'pro', 'max'],
  retention: ['hobby', 'pro', 'max'],
  attribution: ['hobby', 'pro', 'max'],
  segments: ['hobby', 'pro', 'max'],
  alerts: ['hobby', 'pro', 'max'],
  webhooks: ['hobby', 'pro', 'max'],
  customMetrics: ['hobby', 'pro', 'max'],
  journeys: ['hobby', 'pro', 'max'],
  heatmaps: ['hobby', 'pro', 'max'],
  sessionReplay: ['hobby', 'pro', 'max'],
  featureFlags: ['hobby', 'pro', 'max'],
  llmObservability: ['hobby', 'pro', 'max'],
  errorTracking: ['hobby', 'pro', 'max'],

  // Pro+ - just data export, which is bandwidth-heavy and used infrequently.
  export: ['pro', 'max'],

  // Max only - enterprise polish.
  customIntegrations: ['max'],
  dedicatedSupport: ['max'],
};

export function canAccess(feature: string, userPlan: string): boolean {
  const allowedPlans = FEATURE_ACCESS[feature];
  if (!allowedPlans) return true; // unknown feature -> allow (fail open).
  return allowedPlans.includes(userPlan as PlanId);
}

/** Lowest plan tier that has access to the feature, for upsell copy. */
export function getRequiredPlan(feature: string): PlanId {
  const allowedPlans = FEATURE_ACCESS[feature];
  if (!allowedPlans || allowedPlans.length === 0) return 'free';
  for (const plan of PLAN_ORDER) {
    if (allowedPlans.includes(plan)) return plan;
  }
  return 'hobby';
}
