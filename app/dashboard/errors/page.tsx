import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { db, errorGroups, users } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bug, Users as UsersIcon, Clock } from 'lucide-react';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { formatDateTime } from '@/lib/utils/date';

export const metadata: Metadata = {
  title: 'Errors',
};

interface PageProps {
  searchParams: Promise<{ status?: 'unresolved' | 'resolved' | 'ignored' }>;
}

const STATUS_TABS: Array<{ id: 'unresolved' | 'resolved' | 'ignored' | undefined; label: string }> = [
  { id: 'unresolved', label: 'Unresolved' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'ignored', label: 'Ignored' },
  { id: undefined, label: 'All' },
];

export default async function ErrorsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/auth/signin');

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  const userPlan = user?.plan || 'free';

  const membership = await getCurrentProjectWithRole(session.userId);
  if (!membership) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Errors</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const params = await searchParams;
  const statusFilter = params.status ?? 'unresolved';

  const where = statusFilter
    ? and(eq(errorGroups.projectId, project.id), eq(errorGroups.status, statusFilter))
    : eq(errorGroups.projectId, project.id);

  const groups = await db.query.errorGroups.findMany({
    where,
    orderBy: desc(errorGroups.lastSeenAt),
    limit: 100,
  });

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Errors</h1>
            {role !== 'owner' && <RoleBadge role={role} />}
          </div>
          <p className="text-muted-foreground">
            Captured exceptions grouped by stack trace
          </p>
        </div>

        <FeatureGate feature="errorTracking" userPlan={userPlan} requiredPlan="hobby">
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_TABS.map(t => (
              <Link
                key={t.id ?? 'all'}
                href={t.id ? `/dashboard/errors?status=${t.id}` : `/dashboard/errors?status=`}
                className={
                  (statusFilter === t.id || (statusFilter === 'unresolved' && t.id === 'unresolved'))
                    ? 'inline-flex items-center rounded-full bg-zinc-800 text-white px-3 py-1 text-xs'
                    : 'inline-flex items-center rounded-full border border-zinc-800 text-zinc-400 hover:text-zinc-200 px-3 py-1 text-xs'
                }
              >
                {t.label}
              </Link>
            ))}
          </div>

          {groups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bug className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No errors</h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  Capture an exception with{' '}
                  <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">serla.captureException(err)</code>{' '}
                  to see grouped error reports here.
                </p>
                <Link
                  href="/docs"
                  className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  View SDK docs →
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {groups.map(g => (
                <Link key={g.id} href={`/dashboard/errors/${g.id}`} className="block">
                  <Card className="hover:bg-zinc-900/40 transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-start gap-4">
                      <div className="h-10 w-10 rounded-md bg-red-500/10 flex items-center justify-center shrink-0">
                        <Bug className="h-5 w-5 text-red-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {g.type && (
                            <code className="text-xs font-mono text-zinc-400 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                              {g.type}
                            </code>
                          )}
                          <span className="text-sm font-medium text-white truncate">
                            {g.message}
                          </span>
                          {g.status === 'resolved' && (
                            <Badge variant="outline" className="text-green-400 border-green-500/40 text-[10px]">
                              resolved
                            </Badge>
                          )}
                          {g.status === 'ignored' && (
                            <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-[10px]">
                              ignored
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Bug className="h-3 w-3" />
                            {g.occurrenceCount.toLocaleString()} occurrences
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <UsersIcon className="h-3 w-3" />
                            {g.affectedUsers.toLocaleString()} users
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            last seen {formatDateTime(g.lastSeenAt)}
                          </span>
                          {g.release && <span>release {g.release}</span>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </FeatureGate>
      </div>
    </div>
  );
}
