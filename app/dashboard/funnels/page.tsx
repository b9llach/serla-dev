import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Funnels',
};
import { db, funnels, events, projects, users, segments } from '@/lib/db';
import { eq, and, sql, desc, SQL } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { parseRangeFromSearchParams } from '@/lib/utils/date-range';
import { segmentFiltersToSql, type SegmentFilters } from '@/lib/utils/segment-filter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, GitBranch } from 'lucide-react';
import { FunnelDialog } from '@/components/dashboard/funnel-dialog';
import { FunnelChart } from '@/components/dashboard/funnel-chart';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { SegmentFilter } from '@/components/dashboard/segment-filter';

interface FunnelStep {
  name: string;
  type: 'event' | 'pageview';
  eventName?: string;
  pagePathPattern?: string;
}

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; segment?: string }>;
}

/**
 * Compute sequential-progression funnel counts.
 *
 * For each user, find the earliest time they triggered step 1. Then among those,
 * find users who triggered step 2 strictly AFTER their step-1 time. And so on.
 *
 * Returns an array where stepCounts[i] = users who completed steps 1..i+1 in order.
 */
async function computeFunnelStepCounts(
  projectId: string,
  steps: FunnelStep[],
  from: Date,
  to: Date,
  segmentSql: SQL | undefined
): Promise<number[]> {
  if (steps.length === 0) return [];

  const stepConditions = steps.map((step) => {
    if (step.type === 'event' && step.eventName) {
      return sql`MIN(CASE WHEN ${events.name} = ${step.eventName} THEN ${events.timestamp} END)`;
    }
    if (step.type === 'pageview' && step.pagePathPattern) {
      return sql`MIN(CASE WHEN ${events.pagePath} LIKE ${step.pagePathPattern} THEN ${events.timestamp} END)`;
    }
    return sql`NULL::timestamp`;
  });

  const stepSelect = stepConditions.reduce((acc, expr, i) => {
    return i === 0
      ? sql`${expr} AS step_0`
      : sql`${acc}, ${expr} AS step_${sql.raw(String(i))}`;
  }, sql`${sql.raw('')}` as ReturnType<typeof sql>);

  const countExprs = steps.map((_, i) => {
    let cond = sql`step_0 IS NOT NULL`;
    for (let j = 1; j <= i; j++) {
      cond = sql`${cond} AND step_${sql.raw(String(j))} > step_${sql.raw(String(j - 1))}`;
    }
    return sql`COUNT(*) FILTER (WHERE ${cond}) AS count_${sql.raw(String(i))}`;
  });
  const countSelect = countExprs.reduce(
    (acc, expr, i) => (i === 0 ? expr : sql`${acc}, ${expr}`),
    sql`` as ReturnType<typeof sql>
  );

  // Optional segment filter is AND-merged into the inner CTE's WHERE.
  const segmentClause = segmentSql ? sql` AND (${segmentSql})` : sql``;

  const rows = await db.execute(sql`
    WITH per_user AS (
      SELECT ${events.distinctId} AS distinct_id, ${stepSelect}
      FROM ${events}
      WHERE ${events.projectId} = ${projectId}
        AND ${events.distinctId} IS NOT NULL
        AND ${events.timestamp} >= ${from}
        AND ${events.timestamp} < ${to}
        ${segmentClause}
      GROUP BY ${events.distinctId}
    )
    SELECT ${countSelect} FROM per_user
  `);

  const row = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows?.[0]) as
    | Record<string, string | number | null>
    | undefined;

  return steps.map((_, i) => Number(row?.[`count_${i}`] ?? 0));
}

async function getFunnelsData(
  projectId: string,
  from: Date,
  to: Date,
  segmentSql: SQL | undefined
) {
  const userFunnels = await db.query.funnels.findMany({
    where: eq(funnels.projectId, projectId),
    orderBy: desc(funnels.createdAt),
  });

  const funnelsWithStats = await Promise.all(
    userFunnels.map(async (funnel) => {
      const steps = funnel.steps as FunnelStep[];
      const stepCounts = await computeFunnelStepCounts(projectId, steps, from, to, segmentSql);

      const conversionRate = stepCounts.length > 1 && stepCounts[0] > 0
        ? ((stepCounts[stepCounts.length - 1] / stepCounts[0]) * 100).toFixed(1)
        : '0';

      return {
        ...funnel,
        steps,
        stepCounts,
        conversionRate,
      };
    })
  );

  return funnelsWithStats;
}

async function getProjectSegments(projectId: string) {
  return db.query.segments.findMany({
    where: eq(segments.projectId, projectId),
    columns: { id: true, name: true, filters: true },
    orderBy: desc(segments.createdAt),
  });
}

export default async function FunnelsPage({ searchParams }: PageProps) {
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
          <h1 className="text-2xl font-bold mb-4">Funnels</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const canEdit = role === 'owner' || role === 'editor';

  const params = await searchParams;
  const { from, to } = parseRangeFromSearchParams(params, 7);
  const projectSegments = await getProjectSegments(project.id);
  const selectedSegment = params.segment
    ? projectSegments.find(s => s.id === params.segment) ?? null
    : null;
  const segmentSql = selectedSegment
    ? segmentFiltersToSql(selectedSegment.filters as SegmentFilters)
    : undefined;

  const funnelsData = await getFunnelsData(project.id, from, to, segmentSql);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Funnels</h1>
              {role !== 'owner' && <RoleBadge role={role} />}
            </div>
            <p className="text-muted-foreground">
              Analyze multi-step conversion funnels
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

        <FeatureGate feature="funnels" userPlan={userPlan} requiredPlan="hobby">
          <div className="space-y-6">
            {canEdit && (
              <div className="flex justify-end">
                <FunnelDialog projectId={project.id}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Funnel
                  </Button>
                </FunnelDialog>
              </div>
            )}

            {funnelsData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No funnels yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create funnels to visualize user conversion paths.
                  </p>
                  {canEdit && (
                    <FunnelDialog projectId={project.id}>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create your first funnel
                      </Button>
                    </FunnelDialog>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {funnelsData.map((funnel) => (
                  <Card key={funnel.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle>{funnel.name}</CardTitle>
                          <CardDescription>
                            {funnel.steps.length} steps | {funnel.windowDays} day window | {funnel.conversionRate}% conversion
                          </CardDescription>
                        </div>
                        {selectedSegment && (
                          <Badge variant="secondary">Segment: {selectedSegment.name}</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <FunnelChart steps={funnel.steps} counts={funnel.stepCounts} />
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
