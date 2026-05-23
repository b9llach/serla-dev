import { Metadata } from 'next';
import { db, users, projects, events, sessions } from '@/lib/db';
import { count, sql, gte, desc, isNull } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Folder, Activity, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Admin - Stats',
};

async function getDetailedStats() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Total counts
  const [totalUsers] = await db.select({ count: count() }).from(users);
  const [totalProjects] = await db.select({ count: count() }).from(projects);
  const [totalEvents] = await db.select({ count: count() }).from(events);
  const [totalSessions] = await db.select({ count: count() }).from(sessions);

  // Users by plan
  const planStats = await db
    .select({
      plan: users.plan,
      count: count(),
    })
    .from(users)
    .groupBy(users.plan);

  // New users in last 7 days
  const [newUsers7d] = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.createdAt, sevenDaysAgo));

  // New users in last 30 days
  const [newUsers30d] = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.createdAt, thirtyDaysAgo));

  // Events in last 7 days
  const [events7d] = await db
    .select({ count: count() })
    .from(events)
    .where(gte(events.timestamp, sevenDaysAgo));

  // Events in last 30 days
  const [events30d] = await db
    .select({ count: count() })
    .from(events)
    .where(gte(events.timestamp, thirtyDaysAgo));

  // Recent signups
  const recentSignups = await db.query.users.findMany({
    where: isNull(users.deletedAt),
    orderBy: desc(users.createdAt),
    limit: 10,
  });

  // Top projects by event count
  const topProjects = await db
    .select({
      projectId: events.projectId,
      count: count(),
    })
    .from(events)
    .where(gte(events.timestamp, thirtyDaysAgo))
    .groupBy(events.projectId)
    .orderBy(desc(count()))
    .limit(10);

  // Get project details (only if we have projects)
  let topProjectsWithDetails: Array<{
    projectId: string;
    count: number;
    project?: {
      id: string;
      name: string;
      user?: { email: string } | null;
    } | null;
  }> = [];

  if (topProjects.length > 0) {
    const projectIds = topProjects.map(p => p.projectId);
    const projectDetails = await db.query.projects.findMany({
      where: (projects, { inArray }) => inArray(projects.id, projectIds),
      with: {
        user: true,
      },
    });

    const projectMap = new Map(projectDetails.map(p => [p.id, p]));
    topProjectsWithDetails = topProjects.map(p => ({
      ...p,
      project: projectMap.get(p.projectId),
    }));
  }

  return {
    totalUsers: Number(totalUsers?.count || 0),
    totalProjects: Number(totalProjects?.count || 0),
    totalEvents: Number(totalEvents?.count || 0),
    totalSessions: Number(totalSessions?.count || 0),
    planStats: planStats.reduce((acc, { plan, count }) => {
      acc[plan] = Number(count);
      return acc;
    }, {} as Record<string, number>),
    newUsers7d: Number(newUsers7d?.count || 0),
    newUsers30d: Number(newUsers30d?.count || 0),
    events7d: Number(events7d?.count || 0),
    events30d: Number(events30d?.count || 0),
    recentSignups,
    topProjects: topProjectsWithDetails,
  };
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default async function AdminStatsPage() {
  const stats = await getDetailedStats();

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Statistics</h1>
          <p className="text-zinc-500">Overview of platform usage and growth</p>
        </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatNumber(stats.totalUsers)}</div>
            <p className="text-xs text-zinc-500 mt-1">
              +{stats.newUsers7d} last 7 days
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Total Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatNumber(stats.totalProjects)}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {(stats.totalProjects / Math.max(stats.totalUsers, 1)).toFixed(1)} avg per user
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Total Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatNumber(stats.totalEvents)}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {formatNumber(stats.events7d)} last 7 days
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatNumber(stats.totalSessions)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Distribution */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Users by Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['free', 'hobby', 'pro', 'max'].map((plan) => (
              <div key={plan} className="bg-zinc-800/50 rounded-lg p-4">
                <div className="text-sm text-zinc-400 capitalize">{plan}</div>
                <div className="text-xl font-bold text-white mt-1">
                  {stats.planStats[plan] || 0}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {((stats.planStats[plan] || 0) / Math.max(stats.totalUsers, 1) * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Signups */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Signups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentSignups.map((user) => (
                <div key={user.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white">{user.name || user.email}</div>
                    <div className="text-xs text-zinc-500">{user.email}</div>
                  </div>
                  <div className="text-xs text-zinc-500">{formatDate(user.createdAt)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Projects */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Top Projects (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topProjects.map((item, index) => (
                <div key={item.projectId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-600 w-4">{index + 1}</span>
                    <div>
                      <div className="text-sm text-white">
                        {item.project?.name || 'Unknown Project'}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {item.project?.user?.email || 'Unknown User'}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-zinc-400">
                    {formatNumber(Number(item.count))} events
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
