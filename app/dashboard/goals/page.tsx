import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Goals',
};
import { db, goals, events, projects, users, segments } from '@/lib/db';
import { eq, and, gte, lt, sql, desc, SQL } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { parseRangeFromSearchParams } from '@/lib/utils/date-range';
import { segmentFiltersToSql, type SegmentFilters } from '@/lib/utils/segment-filter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Target, TrendingUp } from 'lucide-react';
import { GoalDialog } from '@/components/dashboard/goal-dialog';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { SegmentFilter } from '@/components/dashboard/segment-filter';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; segment?: string }>;
}

async function getGoalsData(
  projectId: string,
  from: Date,
  to: Date,
  segmentSql: SQL | undefined
) {
  const userGoals = await db.query.goals.findMany({
    where: eq(goals.projectId, projectId),
    orderBy: desc(goals.createdAt),
  });

  const goalsWithStats = await Promise.all(
    userGoals.map(async (goal) => {
      let completions = 0;

      if (goal.type === 'event' && goal.eventName) {
        const result = await db
          .select({ count: sql<number>`count(distinct ${events.distinctId})` })
          .from(events)
          .where(
            and(
              eq(events.projectId, projectId),
              eq(events.name, goal.eventName),
              gte(events.timestamp, from),
              lt(events.timestamp, to),
              ...(segmentSql ? [segmentSql] : [])
            )
          );
        completions = Number(result[0]?.count || 0);
      } else if (goal.type === 'pageview' && goal.pagePathPattern) {
        const result = await db
          .select({ count: sql<number>`count(distinct ${events.distinctId})` })
          .from(events)
          .where(
            and(
              eq(events.projectId, projectId),
              eq(events.name, '$pageview'),
              sql`${events.pagePath} LIKE ${goal.pagePathPattern.replace('*', '%')}`,
              gte(events.timestamp, from),
              lt(events.timestamp, to),
              ...(segmentSql ? [segmentSql] : [])
            )
          );
        completions = Number(result[0]?.count || 0);
      }

      return {
        ...goal,
        completions,
        value: goal.value ? Number(goal.value) : null,
      };
    })
  );

  return goalsWithStats;
}

export default async function GoalsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  const userPlan = user?.plan || 'free';

  const membership = await getCurrentProjectWithRole(session.userId);

  if (!membership) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Goals</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const canEdit = role === 'owner' || role === 'editor';

  const params = await searchParams;
  const { from, to } = parseRangeFromSearchParams(params, 7);

  const projectSegments = await db.query.segments.findMany({
    where: eq(segments.projectId, project.id),
    columns: { id: true, name: true, filters: true },
    orderBy: desc(segments.createdAt),
  });
  const selectedSegment = params.segment
    ? projectSegments.find(s => s.id === params.segment) ?? null
    : null;
  const segmentSql = selectedSegment
    ? segmentFiltersToSql(selectedSegment.filters as SegmentFilters)
    : undefined;

  const goalsData = await getGoalsData(project.id, from, to, segmentSql);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Goals</h1>
              {role !== 'owner' && <RoleBadge role={role} />}
            </div>
            <p className="text-muted-foreground">
              Track conversion goals and their completion rates
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentFilter
              segments={projectSegments.map(s => ({ id: s.id, name: s.name }))}
              selectedId={selectedSegment?.id ?? null}
            />
            <DateRangePicker defaultPreset="7d" />
          </div>
        </div>

        <FeatureGate feature="goals" userPlan={userPlan} requiredPlan="hobby">
          <div className="space-y-6">
            {canEdit && (
              <div className="flex justify-end">
                <GoalDialog projectId={project.id}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Goal
                  </Button>
                </GoalDialog>
              </div>
            )}

            {goalsData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Target className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No goals yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create goals to track conversions and important user actions.
                  </p>
                  {canEdit && (
                    <GoalDialog projectId={project.id}>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create your first goal
                      </Button>
                    </GoalDialog>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {goalsData.map((goal) => (
                  <Card key={goal.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant={goal.type === 'event' ? 'default' : 'secondary'}>
                          {goal.type}
                        </Badge>
                        {goal.value && (
                          <span className="text-sm text-muted-foreground">
                            ${goal.value}/conversion
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-lg">{goal.name}</CardTitle>
                      <CardDescription className="truncate">
                        {goal.type === 'event' ? goal.eventName : goal.pagePathPattern}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-2xl font-bold">{goal.completions.toLocaleString()}</span>
                        <span className="text-muted-foreground">completions (7d)</span>
                      </div>
                      {goal.value && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Total value: ${(goal.completions * goal.value).toLocaleString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </FeatureGate>
      </div>
    </div>
  );
}
