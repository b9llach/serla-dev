import { db, projects, users, events, apiKeys } from '@/lib/db';
import { eq, and, gte, sql, inArray, isNull } from 'drizzle-orm';
import { PLAN_LIMITS, PlanId } from '@/lib/polar/client';

export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * API key scopes.
 *
 * - `secret` (sk_live_...) grants everything, including reading raw event
 *   data back out via /api/v1/export. Server-side only.
 * - `public` (pk_live_...) is write-only ingest plus feature-flag
 *   resolution. Safe to embed in a browser or mobile bundle, where any
 *   visitor can read it out of the source.
 *
 * The prefix is part of the key itself so a leaked key is identifiable at a
 * glance (and greppable in secret scanners).
 */
export type ApiKeyScope = 'secret' | 'public';

export function generateApiKey(
  scope: ApiKeyScope = 'secret'
): { key: string; hash: Promise<string>; prefix: string; scope: ApiKeyScope } {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const suffix = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const key = (scope === 'public' ? 'pk_live_' : 'sk_live_') + suffix;
  const hash = hashApiKey(key);
  const prefix = key.substring(0, 16);
  return { key, hash, prefix, scope };
}

interface ValidateResult {
  valid: boolean;
  project?: typeof projects.$inferSelect;
  user?: typeof users.$inferSelect;
  withinLimits?: boolean;
  limitError?: string;
  /** Scope of the key that authenticated this request. */
  scope?: ApiKeyScope;
  /** True when the key was valid but lacks the scope the endpoint requires. */
  insufficientScope?: boolean;
}

/**
 * Validate an `Authorization: Bearer <key>` header.
 *
 * Pass `requiredScope: 'secret'` on endpoints that read data back out.
 * Public (pk_live_) keys are rejected there because they are designed to be
 * embedded in client bundles where anyone can read them - a public key must
 * never be able to export another user's raw events.
 *
 * Ingest endpoints omit the option and accept both scopes.
 */
export async function validateApiKey(
  authHeader: string | null,
  options: { requiredScope?: ApiKeyScope } = {}
): Promise<ValidateResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false };
  }

  const apiKey = authHeader.substring(7);
  const hash = await hashApiKey(apiKey);

  // Look up the key in api_keys (the new multi-key table). Filter out
  // revoked keys. The unique index on key_hash makes this a single index hit.
  // Done in two queries so we don't have to depend on Drizzle's join-with-
  // table-alias return shape, which was returning column subsets on neon-http.
  const apiKeyRow = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)),
    columns: { id: true, projectId: true, scope: true },
  });
  if (!apiKeyRow) {
    return { valid: false };
  }

  const scope = (apiKeyRow.scope as ApiKeyScope) ?? 'secret';
  // Only 'secret' satisfies a 'secret' requirement. There is no hierarchy
  // beyond that today, so an explicit equality check is the whole rule.
  if (options.requiredScope === 'secret' && scope !== 'secret') {
    return { valid: false, insufficientScope: true, scope };
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, apiKeyRow.projectId), isNull(projects.deletedAt)),
  });
  if (!project) {
    return { valid: false };
  }

  // Bump last_used_at at most once every 5 minutes per key to avoid
  // hammering writes on every request. Fire-and-forget so ingestion stays
  // on the fast path.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, apiKeyRow.id),
        sql`(${apiKeys.lastUsedAt} IS NULL OR ${apiKeys.lastUsedAt} < now() - interval '5 minutes')`,
      ),
    )
    .catch(err => {
      console.error('[auth] failed to bump last_used_at', err);
    });

  return { valid: true, project, scope };
}

// Extended validation that includes usage limit checking
export async function validateApiKeyWithLimits(
  authHeader: string | null,
  options: { requiredScope?: ApiKeyScope } = {}
): Promise<ValidateResult> {
  const basicResult = await validateApiKey(authHeader, options);

  if (!basicResult.valid || !basicResult.project) {
    return basicResult;
  }

  const project = basicResult.project;

  // Get the user for this project
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, project.userId), isNull(users.deletedAt)),
  });

  if (!user) {
    return { valid: false, limitError: 'User not found' };
  }

  // Get plan limits
  const planLimits = PLAN_LIMITS[user.plan as PlanId] || PLAN_LIMITS.free;

  // If unlimited events, skip the usage check
  if (planLimits.eventsPerMonth < 0) {
    return { valid: true, project, user, withinLimits: true };
  }

  // Get current month's event count for all user's projects
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get all project IDs for this user
  const userProjects = await db.query.projects.findMany({
    where: and(eq(projects.userId, user.id), isNull(projects.deletedAt)),
    columns: { id: true },
  });

  const projectIds = userProjects.map(p => p.id);

  // Count events across all projects in a single query
  let totalEvents = 0;
  if (projectIds.length > 0) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(
        and(
          inArray(events.projectId, projectIds),
          gte(events.timestamp, monthStart)
        )
      );
    totalEvents = Number(result[0]?.count || 0);
  }

  // Check if within limits
  if (totalEvents >= planLimits.eventsPerMonth) {
    return {
      valid: true,
      project,
      user,
      withinLimits: false,
      limitError: `Monthly event limit of ${planLimits.eventsPerMonth.toLocaleString()} exceeded. Please upgrade your plan.`,
    };
  }

  return { valid: true, project, user, withinLimits: true };
}
