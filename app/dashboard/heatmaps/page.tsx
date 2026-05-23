import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Heatmaps',
};

import { db, events, users } from '@/lib/db';
import { and, eq, gte, lt, sql, isNotNull, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProject } from '@/lib/utils/project';
import { parseRangeFromSearchParams } from '@/lib/utils/date-range';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Flame, MousePointerClick } from 'lucide-react';
import { HeatmapViewer } from '@/components/dashboard/heatmap-viewer';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; path?: string }>;
}

interface ElementClick {
  selector: string;
  count: number;
  // Normalized 0..1 within viewport (mean of all clicks on this selector).
  // Falls back to absolute pixel coords if viewport dims weren't captured.
  meanX: number;
  meanY: number;
  hasViewport: boolean;
}

async function getPagesWithClicks(projectId: string, from: Date, to: Date) {
  const rows = await db
    .select({
      pagePath: events.pagePath,
      clickCount: sql<number>`count(*)`,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, projectId),
        eq(events.name, '$autoclick'),
        gte(events.timestamp, from),
        lt(events.timestamp, to),
        isNotNull(events.pagePath),
        isNotNull(events.clickX)
      )
    )
    .groupBy(events.pagePath)
    .orderBy(desc(sql`count(*)`))
    .limit(50);

  return rows
    .filter(r => r.pagePath)
    .map(r => ({ pagePath: r.pagePath!, clickCount: Number(r.clickCount) }));
}

async function getElementClicks(
  projectId: string,
  pagePath: string,
  from: Date,
  to: Date
): Promise<ElementClick[]> {
  // Aggregate by element_selector. Mean coords are calculated using the
  // percentile coordinate if viewport dimensions are present in properties,
  // otherwise fall back to raw pixel coords (less useful but not nothing).
  const rows = await db
    .select({
      selector: events.elementSelector,
      count: sql<number>`count(*)`,
      // Normalised mean - falls back to absolute X if no viewport width
      // recorded for the row.
      meanXPct: sql<number>`avg(
        CASE
          WHEN (${events.properties}->>'viewportWidth') IS NOT NULL
            AND (${events.properties}->>'viewportWidth')::float > 0
          THEN ${events.clickX}::float / (${events.properties}->>'viewportWidth')::float
          ELSE NULL
        END
      )`,
      meanYPct: sql<number>`avg(
        CASE
          WHEN (${events.properties}->>'viewportHeight') IS NOT NULL
            AND (${events.properties}->>'viewportHeight')::float > 0
          THEN ${events.clickY}::float / (${events.properties}->>'viewportHeight')::float
          ELSE NULL
        END
      )`,
      meanXAbs: sql<number>`avg(${events.clickX})`,
      meanYAbs: sql<number>`avg(${events.clickY})`,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, projectId),
        eq(events.name, '$autoclick'),
        eq(events.pagePath, pagePath),
        gte(events.timestamp, from),
        lt(events.timestamp, to),
        isNotNull(events.elementSelector),
        isNotNull(events.clickX)
      )
    )
    .groupBy(events.elementSelector)
    .orderBy(desc(sql`count(*)`))
    .limit(40);

  return rows
    .filter(r => r.selector)
    .map(r => {
      const hasViewport = r.meanXPct != null && r.meanYPct != null;
      return {
        selector: r.selector!,
        count: Number(r.count),
        meanX: hasViewport ? Number(r.meanXPct) : Number(r.meanXAbs ?? 0),
        meanY: hasViewport ? Number(r.meanYPct) : Number(r.meanYAbs ?? 0),
        hasViewport,
      };
    });
}

export default async function HeatmapsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/auth/signin');

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  const userPlan = user?.plan || 'free';

  const project = await getCurrentProject(session.userId);
  if (!project) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Heatmaps</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const { from, to } = parseRangeFromSearchParams(params, 30);
  const selectedPath = params.path;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Heatmaps</h1>
            <p className="text-muted-foreground">
              See where users click. Requires <code className="text-xs bg-zinc-800/50 px-1 py-0.5 rounded">autoClicks: true</code> in the SDK.
            </p>
          </div>
          <DateRangePicker defaultPreset="30d" />
        </div>

        <FeatureGate feature="heatmaps" userPlan={userPlan} requiredPlan="pro">
          <HeatmapsContent
            projectId={project.id}
            from={from}
            to={to}
            selectedPath={selectedPath}
          />
        </FeatureGate>
      </div>
    </div>
  );
}

async function HeatmapsContent({
  projectId,
  from,
  to,
  selectedPath,
}: {
  projectId: string;
  from: Date;
  to: Date;
  selectedPath: string | undefined;
}) {
  const pages = await getPagesWithClicks(projectId, from, to);

  if (pages.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Flame className="h-10 w-10 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No click data yet</h3>
          <p className="text-muted-foreground text-sm max-w-md">
            Heatmaps build from <code className="text-xs bg-zinc-800/50 px-1 py-0.5 rounded">$autoclick</code> events.
            Enable <code className="text-xs bg-zinc-800/50 px-1 py-0.5 rounded">autoClicks: true</code> in the SDK to start capturing clicks.
          </p>
          <Link
            href="/docs"
            className="text-xs underline text-zinc-400 hover:text-zinc-200 mt-4"
          >
            SDK docs →
          </Link>
        </CardContent>
      </Card>
    );
  }

  const elements = selectedPath ? await getElementClicks(projectId, selectedPath, from, to) : [];

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      {/* Page picker */}
      <Card className="self-start">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Pages</CardTitle>
          <CardDescription className="text-xs">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'} with click data
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-y-auto">
            {pages.map(p => (
              <Link
                key={p.pagePath}
                href={pagePathHref(p.pagePath)}
                className={
                  selectedPath === p.pagePath
                    ? 'flex items-center justify-between gap-3 px-4 py-2 bg-zinc-800/40 border-l-2 border-blue-500 text-white'
                    : 'flex items-center justify-between gap-3 px-4 py-2 hover:bg-zinc-800/30 text-zinc-300 border-l-2 border-transparent'
                }
              >
                <span className="truncate text-sm font-mono">{p.pagePath}</span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {p.clickCount.toLocaleString()}
                </Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detail */}
      {selectedPath ? (
        <HeatmapViewer
          pagePath={selectedPath}
          elements={elements.map(e => ({
            selector: e.selector,
            count: e.count,
            meanX: e.meanX,
            meanY: e.meanY,
            hasViewport: e.hasViewport,
          }))}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MousePointerClick className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Pick a page</h3>
            <p className="text-muted-foreground text-sm">
              Select a page from the left to see ranked click activity and an interactive heatmap overlay.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function pagePathHref(path: string): string {
  return `/dashboard/heatmaps?path=${encodeURIComponent(path)}`;
}
