import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { db, sessionRecordings, users } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Video, AlertTriangle, Clock, User as UserIcon } from 'lucide-react';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { formatDateTime } from '@/lib/utils/date';

export const metadata: Metadata = {
  title: 'Session Replays',
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ReplaysPage() {
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
          <h1 className="text-2xl font-bold mb-4">Session Replays</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;

  const recordings = await db.query.sessionRecordings.findMany({
    where: eq(sessionRecordings.projectId, project.id),
    orderBy: desc(sessionRecordings.startedAt),
    limit: 100,
  });

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Session Replays</h1>
            {role !== 'owner' && <RoleBadge role={role} />}
          </div>
          <p className="text-muted-foreground">
            Watch real user sessions recorded by the SDK
          </p>
        </div>

        <FeatureGate feature="sessionReplay" userPlan={userPlan} requiredPlan="hobby">
          {recordings.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Video className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No recordings yet</h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  Enable session replay in the JS SDK by passing
                  {' '}<code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">recordSessions: true</code>{' '}
                  to <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">Serla.init()</code>.
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
              {recordings.map(r => (
                <Link
                  key={r.id}
                  href={`/dashboard/replays/${r.id}`}
                  className="block"
                >
                  <Card className="hover:bg-zinc-900/40 transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-md bg-zinc-800/50 flex items-center justify-center shrink-0">
                        <Video className="h-5 w-5 text-zinc-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white truncate">
                            {r.startUrl || r.sessionId.slice(0, 20)}
                          </span>
                          {r.hasErrors && (
                            <Badge variant="outline" className="text-red-400 border-red-500/40 text-[10px]">
                              <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                              errors
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                          <span className="inline-flex items-center gap-1">
                            <UserIcon className="h-3 w-3" />
                            {r.distinctId ?? 'anonymous'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(r.durationMs)}
                          </span>
                          {r.browser && <span>{r.browser}</span>}
                          {r.country && <span>{r.country}</span>}
                          <span className="text-zinc-600">{formatBytes(r.sizeBytes)}</span>
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500 shrink-0 hidden sm:block">
                        {formatDateTime(r.startedAt)}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              {recordings.length === 100 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Showing the 100 most recent recordings.
                </p>
              )}
            </div>
          )}
        </FeatureGate>
      </div>
    </div>
  );
}
