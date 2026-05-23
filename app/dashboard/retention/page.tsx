import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Retention',
};
import { db, events, projects, users } from '@/lib/db';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/utils/project';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RetentionHeatmap } from '@/components/dashboard/retention-heatmap';
import { FeatureGate } from '@/components/dashboard/feature-gate';

async function getRetentionData(projectId: string) {
  const now = new Date();
  const weeksBack = 8;
  const cohorts: { week: string; data: number[] }[] = [];
  // Use UTC millisecond arithmetic so DST transitions don't shift week
  // boundaries by an hour. 7 days = exactly 604800000 ms regardless of TZ.
  const ONE_DAY_MS = 86_400_000;
  const ONE_WEEK_MS = 7 * ONE_DAY_MS;
  // Anchor of "this Sunday 00:00 UTC".
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thisWeekStartMs = todayUtc - (now.getUTCDay() * ONE_DAY_MS);

  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = new Date(thisWeekStartMs - i * ONE_WEEK_MS);
    const weekEnd = new Date(thisWeekStartMs - (i - 1) * ONE_WEEK_MS);

    // Get users who first appeared in this week. Half-open interval [start, end):
    // an event at exactly weekEnd belongs to the NEXT week, not this one.
    const newUsersResult = await db
      .select({ distinctId: events.distinctId })
      .from(events)
      .where(
        and(
          eq(events.projectId, projectId),
          gte(events.timestamp, weekStart),
          lt(events.timestamp, weekEnd),
          sql`${events.distinctId} IS NOT NULL`
        )
      )
      .groupBy(events.distinctId);

    const newUsers = new Set(newUsersResult.map(u => u.distinctId).filter(Boolean));
    const cohortSize = newUsers.size;

    const retention: number[] = [100]; // Week 0 is always 100%

    // Calculate retention for subsequent weeks
    for (let w = 1; w <= weeksBack - i - 1; w++) {
      const retentionWeekStart = new Date(weekStart.getTime() + w * ONE_WEEK_MS);
      const retentionWeekEnd = new Date(weekStart.getTime() + (w + 1) * ONE_WEEK_MS);

      if (retentionWeekEnd > now) {
        retention.push(-1); // Future week
        continue;
      }

      const returningUsersResult = await db
        .select({ distinctId: events.distinctId })
        .from(events)
        .where(
          and(
            eq(events.projectId, projectId),
            gte(events.timestamp, retentionWeekStart),
            lt(events.timestamp, retentionWeekEnd),
            sql`${events.distinctId} IS NOT NULL`
          )
        )
        .groupBy(events.distinctId);

      const returningUsers = new Set(returningUsersResult.map(u => u.distinctId).filter(Boolean));
      const retained = [...newUsers].filter(u => u && returningUsers.has(u)).length;
      const retentionRate = cohortSize > 0 ? Math.round((retained / cohortSize) * 100) : 0;
      retention.push(retentionRate);
    }

    cohorts.push({
      week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      data: retention,
    });
  }

  return cohorts;
}

export default async function RetentionPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  const userPlan = user?.plan || 'free';

  const project = await getCurrentProject(session.userId);

  if (!project) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Retention</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const retentionData = await getRetentionData(project.id);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Retention</h1>
          <p className="text-muted-foreground">
            Analyze user retention with cohort analysis
          </p>
        </div>

        <FeatureGate feature="retention" userPlan={userPlan} requiredPlan="hobby">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Cohort Retention</CardTitle>
              <CardDescription>
                Percentage of users returning each week after their first visit
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RetentionHeatmap cohorts={retentionData} />
            </CardContent>
          </Card>
        </FeatureGate>
      </div>
    </div>
  );
}
