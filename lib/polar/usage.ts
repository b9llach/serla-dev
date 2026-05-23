import { db, users, events, projects } from '@/lib/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getPlanLimits, PlanId } from './client';

export interface UsageData {
  eventsThisMonth: number;
  eventsLimit: number;
  projectCount: number;
  projectsLimit: number;
  retentionDays: number;
  isOverEventLimit: boolean;
  isOverProjectLimit: boolean;
  eventsPercentUsed: number;
}

// Get current usage for a user
export async function getUserUsage(userId: string): Promise<UsageData | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return null;
  }

  const limits = getPlanLimits(user.plan);

  // Get project count
  const userProjects = await db.query.projects.findMany({
    where: eq(projects.userId, userId),
  });

  // Get current month's event count
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalEvents = 0;
  for (const project of userProjects) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(
        and(
          eq(events.projectId, project.id),
          gte(events.timestamp, monthStart)
        )
      );
    totalEvents += Number(result[0]?.count || 0);
  }

  const eventsLimit = limits.eventsPerMonth;
  const projectsLimit = limits.projects;

  return {
    eventsThisMonth: totalEvents,
    eventsLimit,
    projectCount: userProjects.length,
    projectsLimit,
    retentionDays: limits.retentionDays,
    isOverEventLimit: eventsLimit > 0 && totalEvents >= eventsLimit,
    isOverProjectLimit: projectsLimit > 0 && userProjects.length >= projectsLimit,
    eventsPercentUsed: eventsLimit > 0 ? Math.min((totalEvents / eventsLimit) * 100, 100) : 0,
  };
}

// Check if user can create a new project
export async function canCreateProject(userId: string): Promise<boolean> {
  const usage = await getUserUsage(userId);
  if (!usage) return false;

  // Unlimited projects
  if (usage.projectsLimit < 0) return true;

  return usage.projectCount < usage.projectsLimit;
}

// Check if user can ingest more events
export async function canIngestEvents(userId: string): Promise<boolean> {
  const usage = await getUserUsage(userId);
  if (!usage) return false;

  // Unlimited events
  if (usage.eventsLimit < 0) return true;

  return usage.eventsThisMonth < usage.eventsLimit;
}

// Get data retention days for a user's plan
export async function getRetentionDays(userId: string): Promise<number> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return 7; // Default to free plan retention
  }

  const limits = getPlanLimits(user.plan);
  return limits.retentionDays;
}

// Re-export the shared feature gate check so callers can stay on this module.
export { canAccess as canAccessFeature } from '@/lib/plans/features';

// Get user's plan info
export async function getUserPlan(userId: string): Promise<{
  plan: PlanId;
  limits: ReturnType<typeof getPlanLimits>;
} | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return null;
  }

  return {
    plan: user.plan as PlanId,
    limits: getPlanLimits(user.plan),
  };
}
