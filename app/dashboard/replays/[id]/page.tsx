import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { db, sessionRecordings } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getProjectMembership } from '@/lib/utils/project';
import { ReplayPlayer } from '@/components/dashboard/replay-player';
import { ArrowLeft } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/date';

export const metadata: Metadata = {
  title: 'Replay',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReplayDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/auth/signin');

  const { id } = await params;
  const recording = await db.query.sessionRecordings.findFirst({
    where: eq(sessionRecordings.id, id),
  });
  if (!recording) notFound();

  const role = await getProjectMembership(session.userId, recording.projectId);
  if (!role) notFound();

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-4">
        <Link
          href="/dashboard/replays"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to replays
        </Link>
        <div>
          <h1 className="text-xl font-medium text-white truncate">
            {recording.startUrl || `Session ${recording.sessionId.slice(0, 12)}`}
          </h1>
          <p className="text-sm text-zinc-500">
            Recorded {formatDateTime(recording.startedAt)}
          </p>
        </div>
        <ReplayPlayer recordingId={id} />
      </div>
    </div>
  );
}
