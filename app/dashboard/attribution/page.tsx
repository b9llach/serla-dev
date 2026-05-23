import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Attribution',
};
import { db, sessions, events, projects, users, segments } from '@/lib/db';
import { eq, and, gte, lt, sql, desc, SQL } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/utils/project';
import { parseRangeFromSearchParams } from '@/lib/utils/date-range';
import { segmentFiltersToSql, type SegmentFilters } from '@/lib/utils/segment-filter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttributionChart } from '@/components/dashboard/attribution-chart';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { SegmentFilter } from '@/components/dashboard/segment-filter';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; segment?: string }>;
}

async function getAttributionData(
  projectId: string,
  from: Date,
  to: Date,
  segmentSql: SQL | undefined
) {
  // When a segment is active, restrict sessions to those whose events match
  // the segment filter (segment-filter is defined over events table columns).
  const segmentSessionClause = segmentSql
    ? sql`AND ${sessions.id} IN (
        SELECT DISTINCT ${events.sessionId}
        FROM ${events}
        WHERE ${events.projectId} = ${projectId}
          AND ${events.timestamp} >= ${from}
          AND ${events.timestamp} < ${to}
          AND ${events.sessionId} IS NOT NULL
          AND (${segmentSql})
      )`
    : sql``;

  // Get first-touch attribution (from sessions)
  const sourceData = await db
    .select({
      source: sql<string>`COALESCE(${sessions.utmSource}, ${sessions.referrer}, 'direct')`,
      count: sql<number>`count(*)`,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        gte(sessions.startedAt, from),
        lt(sessions.startedAt, to),
        sql`1=1 ${segmentSessionClause}`
      )
    )
    .groupBy(sql`COALESCE(${sessions.utmSource}, ${sessions.referrer}, 'direct')`)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const mediumData = await db
    .select({
      medium: sql<string>`COALESCE(${sessions.utmMedium}, 'none')`,
      count: sql<number>`count(*)`,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        gte(sessions.startedAt, from),
        lt(sessions.startedAt, to),
        sql`1=1 ${segmentSessionClause}`
      )
    )
    .groupBy(sql`COALESCE(${sessions.utmMedium}, 'none')`)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const campaignData = await db
    .select({
      campaign: sql<string>`COALESCE(${sessions.utmCampaign}, 'none')`,
      count: sql<number>`count(*)`,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        gte(sessions.startedAt, from),
        lt(sessions.startedAt, to),
        sql`1=1 ${segmentSessionClause}`
      )
    )
    .groupBy(sql`COALESCE(${sessions.utmCampaign}, 'none')`)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return {
    sources: sourceData.map(d => ({ name: d.source, count: Number(d.count) })),
    mediums: mediumData.map(d => ({ name: d.medium, count: Number(d.count) })),
    campaigns: campaignData.map(d => ({ name: d.campaign, count: Number(d.count) })),
  };
}

export default async function AttributionPage({ searchParams }: PageProps) {
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
          <h1 className="text-2xl font-bold mb-4">Attribution</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }

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

  const attributionData = await getAttributionData(project.id, from, to, segmentSql);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Attribution</h1>
            <p className="text-muted-foreground">
              Understand where your traffic comes from
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

        <FeatureGate feature="attribution" userPlan={userPlan} requiredPlan="hobby">
          <Tabs defaultValue="sources">
            <TabsList>
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="mediums">Mediums</TabsTrigger>
              <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            </TabsList>

            <TabsContent value="sources" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Traffic Sources</CardTitle>
                  <CardDescription>First-touch attribution by source (last 7 days)</CardDescription>
                </CardHeader>
                <CardContent>
                  <AttributionChart data={attributionData.sources} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mediums" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Traffic Mediums</CardTitle>
                  <CardDescription>First-touch attribution by medium (last 7 days)</CardDescription>
                </CardHeader>
                <CardContent>
                  <AttributionChart data={attributionData.mediums} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="campaigns" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Campaigns</CardTitle>
                  <CardDescription>First-touch attribution by campaign (last 7 days)</CardDescription>
                </CardHeader>
                <CardContent>
                  <AttributionChart data={attributionData.campaigns} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </FeatureGate>
      </div>
    </div>
  );
}
