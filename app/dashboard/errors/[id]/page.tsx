import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { db, errorGroups, errorEvents } from '@/lib/db';
import { eq, desc, sql } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getProjectMembership } from '@/lib/utils/project';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Bug, Check, EyeOff, RotateCw } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/date';
import { resolveError, ignoreError, reopenError } from '@/lib/actions/errors';

export const metadata: Metadata = {
  title: 'Error',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ErrorDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/auth/signin');

  const { id } = await params;
  const group = await db.query.errorGroups.findFirst({
    where: eq(errorGroups.id, id),
  });
  if (!group) notFound();

  const role = await getProjectMembership(session.userId, group.projectId);
  if (!role) notFound();
  const canEdit = role === 'owner' || role === 'editor';

  const recent = await db.query.errorEvents.findMany({
    where: eq(errorEvents.groupId, id),
    orderBy: desc(errorEvents.timestamp),
    limit: 20,
  });

  // Breakdown of browsers + urls across recent events.
  const browserBreakdown = await db
    .select({
      browser: errorEvents.browser,
      count: sql<number>`count(*)`,
    })
    .from(errorEvents)
    .where(eq(errorEvents.groupId, id))
    .groupBy(errorEvents.browser)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  const urlBreakdown = await db
    .select({
      url: errorEvents.url,
      count: sql<number>`count(*)`,
    })
    .from(errorEvents)
    .where(eq(errorEvents.groupId, id))
    .groupBy(errorEvents.url)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <Link
          href="/dashboard/errors"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to errors
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {group.type && (
                <code className="text-xs font-mono text-zinc-400 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                  {group.type}
                </code>
              )}
              {group.status === 'resolved' && (
                <Badge variant="outline" className="text-green-400 border-green-500/40 text-[10px]">
                  resolved
                </Badge>
              )}
              {group.status === 'ignored' && (
                <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-[10px]">
                  ignored
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-medium text-white break-words">{group.message}</h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              fingerprint: {group.fingerprint}
            </p>
          </div>

          {canEdit && (
            <div className="flex items-center gap-2 shrink-0">
              {group.status === 'unresolved' && (
                <>
                  <form action={async () => { 'use server'; await resolveError(id); }}>
                    <Button type="submit" size="sm" variant="outline">
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                      Resolve
                    </Button>
                  </form>
                  <form action={async () => { 'use server'; await ignoreError(id); }}>
                    <Button type="submit" size="sm" variant="ghost">
                      <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                      Ignore
                    </Button>
                  </form>
                </>
              )}
              {group.status !== 'unresolved' && (
                <form action={async () => { 'use server'; await reopenError(id); }}>
                  <Button type="submit" size="sm" variant="outline">
                    <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                    Reopen
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Occurrences" value={group.occurrenceCount.toLocaleString()} />
          <StatCard label="Users" value={group.affectedUsers.toLocaleString()} />
          <StatCard label="First seen" value={formatDateTime(group.firstSeenAt)} small />
          <StatCard label="Last seen" value={formatDateTime(group.lastSeenAt)} small />
        </div>

        {recent[0]?.stack && (
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-medium text-zinc-200 mb-3">Stack trace (most recent)</h2>
              <pre className="bg-[#0a0a0a] rounded-lg p-3 text-[11px] font-mono text-zinc-300 overflow-x-auto whitespace-pre">
                {recent[0].stack}
              </pre>
            </CardContent>
          </Card>
        )}

        {browserBreakdown.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h2 className="text-sm font-medium text-zinc-200 mb-3">Browsers</h2>
                <div className="space-y-1.5">
                  {browserBreakdown.map(b => (
                    <div key={b.browser ?? 'unknown'} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{b.browser ?? 'Unknown'}</span>
                      <span className="text-zinc-500">{Number(b.count).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h2 className="text-sm font-medium text-zinc-200 mb-3">URLs</h2>
                <div className="space-y-1.5">
                  {urlBreakdown.map(u => (
                    <div key={u.url ?? 'unknown'} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-zinc-300 truncate min-w-0">{u.url ?? '-'}</span>
                      <span className="text-zinc-500 shrink-0">{Number(u.count).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-medium text-zinc-200 mb-3">Recent occurrences</h2>
            <div className="space-y-1">
              {recent.map(r => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 text-xs bg-zinc-800/20 rounded-md px-3 py-2"
                >
                  <Bug className="h-3 w-3 text-zinc-500 shrink-0" />
                  <span className="text-zinc-300 truncate flex-1 min-w-0">
                    {r.url ?? r.sourceFile ?? r.distinctId ?? 'anonymous'}
                  </span>
                  {r.browser && <span className="text-zinc-500 shrink-0">{r.browser}</span>}
                  <span className="text-zinc-500 shrink-0">{formatDateTime(r.timestamp)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
        <div className={small ? 'text-sm text-white' : 'text-2xl font-medium text-white'}>{value}</div>
      </CardContent>
    </Card>
  );
}
