import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Journeys',
};
import { db, events, projects, users, segments } from '@/lib/db';
import { eq, and, gte, lt, sql, desc, SQL } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/utils/project';
import { parseRangeFromSearchParams } from '@/lib/utils/date-range';
import { segmentFiltersToSql, type SegmentFilters } from '@/lib/utils/segment-filter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { JourneyPaths } from '@/components/dashboard/journey-paths';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { SegmentFilter } from '@/components/dashboard/segment-filter';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; segment?: string }>;
}

async function getJourneyData(
  projectId: string,
  from: Date,
  to: Date,
  segmentSql: SQL | undefined
) {
  // Get events grouped by session to build paths
  const sessionEvents = await db
    .select({
      sessionId: events.sessionId,
      pagePath: events.pagePath,
      name: events.name,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, projectId),
        gte(events.timestamp, from),
        lt(events.timestamp, to),
        sql`${events.sessionId} IS NOT NULL`,
        sql`${events.pagePath} IS NOT NULL`,
        ...(segmentSql ? [segmentSql] : [])
      )
    )
    .orderBy(events.sessionId, events.timestamp)
    .limit(2000); // Reduced from 10000 to minimize memory usage

  // Build paths
  const pathCounts = new Map<string, number>();
  let currentSession = '';
  let currentPath: string[] = [];

  for (const event of sessionEvents) {
    if (event.sessionId !== currentSession) {
      if (currentPath.length > 1) {
        const pathKey = currentPath.slice(0, 5).join(' -> ');
        pathCounts.set(pathKey, (pathCounts.get(pathKey) || 0) + 1);
      }
      currentSession = event.sessionId!;
      currentPath = [];
    }
    if (event.pagePath && (!currentPath.length || currentPath[currentPath.length - 1] !== event.pagePath)) {
      currentPath.push(event.pagePath);
    }
  }

  // Don't forget the last session
  if (currentPath.length > 1) {
    const pathKey = currentPath.slice(0, 5).join(' -> ');
    pathCounts.set(pathKey, (pathCounts.get(pathKey) || 0) + 1);
  }

  // Sort by count and get top paths
  const topPaths = Array.from(pathCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([path, count]) => ({ path, count }));

  return topPaths;
}

export default async function JourneysPage({ searchParams }: PageProps) {
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
          <h1 className="text-2xl font-bold mb-4">Journeys</h1>
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

  const journeyData = await getJourneyData(project.id, from, to, segmentSql);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">User Journeys</h1>
            <p className="text-muted-foreground">
              Analyze the most common paths users take through your site
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

        <FeatureGate feature="journeys" userPlan={userPlan} requiredPlan="pro">
          <Card>
            <CardHeader>
              <CardTitle>Top User Paths</CardTitle>
              <CardDescription>
                Most common navigation patterns in the last 7 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JourneyPaths paths={journeyData} />
            </CardContent>
          </Card>
        </FeatureGate>
      </div>
    </div>
  );
}
