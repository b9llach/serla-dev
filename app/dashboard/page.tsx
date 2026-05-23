import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Dashboard',
};
import { db, events, sessions, users, apiKeys } from '@/lib/db';
import { eq, and, gte, sql, isNotNull, isNull, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { discoverEvents } from '@/lib/analytics/discover';
import { Plus, KeyRound, BookOpen } from 'lucide-react';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { RealtimeDashboard } from '@/components/dashboard/realtime-dashboard';
import { EventGlobe } from '@/components/dashboard/event-globe';
import { Button } from '@/components/ui/button';
import { OnboardingWizard } from '@/components/dashboard/onboarding-wizard';
import { SampleDataBanner } from '@/components/dashboard/sample-data-banner';

async function getDashboardData(projectId: string) {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Total events (all time), split into real vs sample so the onboarding
  // wizard can decide whether a real event has landed yet.
  const totalEventsResult = await db
    .select({
      total: sql<number>`count(*)`,
      sample: sql<number>`count(*) filter (where ${events.properties}->>'isSample' = 'true')`,
    })
    .from(events)
    .where(eq(events.projectId, projectId));
  const totalEvents = Number(totalEventsResult[0]?.total || 0);
  const sampleEvents = Number(totalEventsResult[0]?.sample || 0);
  const realEvents = totalEvents - sampleEvents;

  // Events in last 24 hours
  const last24hEventsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.projectId, projectId), gte(events.timestamp, last24h)));
  const last24hEvents = Number(last24hEventsResult[0]?.count || 0);

  // Total unique users (all time)
  const totalUsersResult = await db
    .select({ count: sql<number>`count(distinct ${events.distinctId})` })
    .from(events)
    .where(eq(events.projectId, projectId));
  const totalUsers = Number(totalUsersResult[0]?.count || 0);

  // Unique users in last 24 hours
  const last24hUsersResult = await db
    .select({ count: sql<number>`count(distinct ${events.distinctId})` })
    .from(events)
    .where(and(eq(events.projectId, projectId), gte(events.timestamp, last24h)));
  const last24hUsers = Number(last24hUsersResult[0]?.count || 0);

  // Total sessions (all time)
  const totalSessionsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(eq(sessions.projectId, projectId));
  const totalSessions = Number(totalSessionsResult[0]?.count || 0);

  // Sessions in last 24 hours
  const last24hSessionsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), gte(sessions.startedAt, last24h)));
  const last24hSessions = Number(last24hSessionsResult[0]?.count || 0);

  // Daily events for sparkline (last 7 days), filling zero-event days
  const dailyEventsRows = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${events.timestamp}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`,
    })
    .from(events)
    .where(and(eq(events.projectId, projectId), gte(events.timestamp, sevenDaysAgo)))
    .groupBy(sql`date_trunc('day', ${events.timestamp})`);

  const dailyUsersRows = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${events.timestamp}), 'YYYY-MM-DD')`,
      count: sql<number>`count(distinct ${events.distinctId})`,
    })
    .from(events)
    .where(and(eq(events.projectId, projectId), gte(events.timestamp, sevenDaysAgo)))
    .groupBy(sql`date_trunc('day', ${events.timestamp})`);

  // Build 7-day arrays with explicit zero fills so the sparkline always has
  // exactly 7 entries, aligned to calendar days (oldest -> newest).
  const eventsByDate = new Map(dailyEventsRows.map(r => [String(r.date), Number(r.count)]));
  const usersByDate = new Map(dailyUsersRows.map(r => [String(r.date), Number(r.count)]));
  const dailyEvents: number[] = [];
  const dailyUsers: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    dailyEvents.push(eventsByDate.get(key) ?? 0);
    dailyUsers.push(usersByDate.get(key) ?? 0);
  }

  // Country distribution (last 7 days)
  const countryDistribution = await db
    .select({
      country: events.country,
      count: sql<number>`count(*)`,
    })
    .from(events)
    .where(and(
      eq(events.projectId, projectId),
      gte(events.timestamp, sevenDaysAgo),
      isNotNull(events.country)
    ))
    .groupBy(events.country)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  // Discover event names + counts for the "Top Events" card.
  const discoveredEvents = await discoverEvents(projectId, 30);

  return {
    totalEvents,
    realEvents,
    sampleEvents,
    last24hEvents,
    totalUsers,
    last24hUsers,
    totalSessions,
    last24hSessions,
    dailyEvents,
    dailyUsers,
    discoveredEvents,
    countryDistribution: countryDistribution.map(c => ({
      country: c.country || 'XX',
      count: Number(c.count),
    })),
  };
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const membership = await getCurrentProjectWithRole(session.userId);

  if (!membership) {
    return (
      <div className="min-h-full p-8">
        <div className="max-w-md mx-auto text-center py-20">
          <h1 className="text-2xl font-medium text-white mb-4">Welcome to Serla</h1>
          <p className="text-zinc-500 mb-8">Create your first project to start tracking events.</p>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Project
          </Link>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const data = await getDashboardData(project.id);

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { onboardingDismissedAt: true },
  });
  const onboardingDismissed = !!user?.onboardingDismissedAt;
  const showWizard = data.realEvents === 0 && !onboardingDismissed && role === 'owner';

  // Show the most recent active key's prefix so the onboarding wizard and the
  // empty-state panel can reference "your API key" without leaking the full
  // value. Null when the project has no keys yet.
  const latestKey = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.projectId, project.id), isNull(apiKeys.revokedAt)),
    orderBy: desc(apiKeys.createdAt),
    columns: { keyPrefix: true },
  });
  const apiKeyPrefix = latestKey?.keyPrefix ?? null;

  // Derive the API host that SDK snippets will point to. Falls back to a
  // placeholder so the snippet remains useful in local dev.
  const host =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://your-domain.com');

  if (showWizard) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-3xl space-y-6">
          <div>
            <h1 className="text-xl font-medium text-white truncate">{project.name}</h1>
            <p className="text-sm text-zinc-500">Let&apos;s get you set up</p>
          </div>
          <OnboardingWizard
            projectId={project.id}
            apiKeyPrefix={apiKeyPrefix}
            realEventsCount={data.realEvents}
            sampleEventsCount={data.sampleEvents}
            host={host}
          />
        </div>
      </div>
    );
  }

  if (data.realEvents === 0 && data.sampleEvents === 0) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-6xl space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-medium text-white truncate">{project.name}</h1>
              <p className="text-sm text-zinc-500">Last 7 days overview</p>
            </div>
            <Link
              href="/dashboard/metrics"
              className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Metric</span>
            </Link>
          </div>

          {/* Onboarding panel */}
          <div className="bg-[#1a1a1a] rounded-xl p-6 sm:p-8 space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-medium text-white">
                Welcome to {project.name}
              </h2>
              <p className="text-sm text-zinc-500">
                Send your first event to see analytics here
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">Your API key</p>
              <Link
                href="/dashboard/settings/api-keys"
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#0a0a0a] hover:bg-black rounded-lg text-sm font-mono text-zinc-300 transition-colors break-all"
              >
                <KeyRound className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="break-all">
                  {apiKeyPrefix ? `${apiKeyPrefix}...` : 'Create an API key →'}
                </span>
              </Link>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">Send a test event</p>
              <pre className="bg-[#0a0a0a] rounded-xl p-4 text-xs font-mono overflow-x-auto text-zinc-300 leading-relaxed">
{`curl -X POST https://your-domain.com/api/v1/events \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "page_view"}'`}
              </pre>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary">
                <Link href="/docs">
                  <BookOpen className="w-4 h-4" />
                  View full docs
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/settings/api-keys">
                  <KeyRound className="w-4 h-4" />
                  Get API key
                </Link>
              </Button>
            </div>

            <p className="text-xs text-zinc-600">
              Your dashboard will update automatically once events arrive.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-medium text-white truncate">{project.name}</h1>
            <p className="text-sm text-zinc-500">Last 7 days overview</p>
          </div>
          <Link
            href="/dashboard/metrics"
            className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Metric</span>
          </Link>
        </div>

        {data.sampleEvents > 0 && (role === 'owner' || role === 'editor') && (
          <SampleDataBanner
            projectId={project.id}
            sampleEventsCount={data.sampleEvents}
            realEventsCount={data.realEvents}
          />
        )}

        {/* Real-time metrics grid */}
        <RealtimeDashboard
          initialData={{
            totalEvents: data.totalEvents,
            last24hEvents: data.last24hEvents,
            totalUsers: data.totalUsers,
            last24hUsers: data.last24hUsers,
            totalSessions: data.totalSessions,
            last24hSessions: data.last24hSessions,
            dailyEvents: data.dailyEvents,
            dailyUsers: data.dailyUsers,
          }}
        />

        {/* Event Globe - full width, hidden on mobile */}
        <div className="hidden lg:block lg:h-[450px]">
          <EventGlobe initialData={data.countryDistribution} className="h-full" />
        </div>

        {/* Top Events */}
        <div className="bg-[#1a1a1a] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800/30">
            <h2 className="text-sm font-medium text-white">Top Events</h2>
            <span className="text-xs text-zinc-500">Last 30 days</span>
          </div>
          <div className="p-4">
            {data.discoveredEvents.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-zinc-500 text-sm">No events recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.discoveredEvents.slice(0, 8).map((event) => (
                  <div key={event.name} className="flex items-center justify-between bg-zinc-800/30 rounded-lg p-3">
                    <span className="text-sm text-white truncate">{event.name}</span>
                    <span className="text-sm font-medium text-zinc-400 ml-2">{formatNumber(event.count)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
