import { Metadata } from 'next';
import { db, users, projects, events } from '@/lib/db';
import { desc, eq, sql, count, isNull } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, CreditCard } from 'lucide-react';
import { UserActions } from '@/components/admin/user-actions';

export const metadata: Metadata = {
  title: 'Admin - Users',
};

async function getStats() {
  const totalUsers = await db.select({ count: count() }).from(users);
  const totalProjects = await db.select({ count: count() }).from(projects);
  const totalEvents = await db.select({ count: count() }).from(events);

  const planCounts = await db
    .select({
      plan: users.plan,
      count: count(),
    })
    .from(users)
    .groupBy(users.plan);

  return {
    totalUsers: Number(totalUsers[0]?.count || 0),
    totalProjects: Number(totalProjects[0]?.count || 0),
    totalEvents: Number(totalEvents[0]?.count || 0),
    planCounts: planCounts.reduce((acc, { plan, count }) => {
      acc[plan] = Number(count);
      return acc;
    }, {} as Record<string, number>),
  };
}

async function getUsers() {
  const allUsers = await db.query.users.findMany({
    where: isNull(users.deletedAt),
    orderBy: desc(users.createdAt),
    limit: 100,
  });

  // Get project counts for each user
  const userProjectCounts = await db
    .select({
      userId: projects.userId,
      count: count(),
    })
    .from(projects)
    .groupBy(projects.userId);

  const projectCountMap = userProjectCounts.reduce((acc, { userId, count }) => {
    acc[userId] = Number(count);
    return acc;
  }, {} as Record<string, number>);

  return allUsers.map(user => ({
    ...user,
    projectCount: projectCountMap[user.id] || 0,
  }));
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getPlanBadgeColor(plan: string): string {
  switch (plan) {
    case 'max':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'pro':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'hobby':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    default:
      return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
  }
}

function getRoleBadgeColor(role: string): string {
  return role === 'admin'
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-zinc-800 text-zinc-500 border-zinc-700';
}

export default async function AdminPage() {
  const stats = await getStats();
  const userList = await getUsers();

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-zinc-500">Manage users and their subscription plans</p>
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.totalUsers}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Free</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.planCounts.free || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {(stats.planCounts.hobby || 0) + (stats.planCounts.pro || 0) + (stats.planCounts.max || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {stats.totalEvents.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4">
                    User
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4">
                    Role
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4">
                    Plan
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4">
                    Projects
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4">
                    Joined
                  </th>
                  <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {userList.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-800/50">
                    <td className="py-3 px-4">
                      <div>
                        <div className="text-sm font-medium text-white">
                          {user.name || 'No name'}
                        </div>
                        <div className="text-sm text-zinc-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={getRoleBadgeColor(user.role)}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={getPlanBadgeColor(user.plan)}>
                        {user.plan}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-zinc-400">
                      {user.projectCount}
                    </td>
                    <td className="py-3 px-4 text-sm text-zinc-400">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <UserActions user={user} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
