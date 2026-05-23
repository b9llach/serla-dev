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

export function generateApiKey(): { key: string; hash: Promise<string>; prefix: string } {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = 'sk_live_' + btoa(String.fromCharCode(...randomBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const hash = hashApiKey(key);
  const prefix = key.substring(0, 16);
  return { key, hash, prefix };
}

interface ValidateResult {
  valid: boolean;
  project?: typeof projects.$inferSelect;
  user?: typeof users.$inferSelect;
  withinLimits?: boolean;
  limitError?: string;
}

export async function validateApiKey(authHeader: string | null): Promise<ValidateResult> {
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
    columns: { id: true, projectId: true },
  });
  if (!apiKeyRow) {
    return { valid: false };
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

  return { valid: true, project };
}

// Extended validation that includes usage limit checking
export async function validateApiKeyWithLimits(authHeader: string | null): Promise<ValidateResult> {
  const basicResult = await validateApiKey(authHeader);

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
