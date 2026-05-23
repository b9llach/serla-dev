import { NextRequest, NextResponse } from 'next/server';
import { gunzipSync } from 'zlib';
import { getSession } from '@/lib/auth/session';
import { db, sessionRecordings, sessionRecordingChunks } from '@/lib/db';
import { getProjectMembership } from '@/lib/utils/project';
import { and, eq, asc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the full set of rrweb events for a recording, in order.
 * Ungzips chunks server-side so the browser player gets a flat events array.
 *
 * For very large recordings we'd want a streaming response or pagination, but
 * the SDK caps recordings at a reasonable size before flushing a new session,
 * so a single payload is fine for v1.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;

  const recording = await db.query.sessionRecordings.findFirst({
    where: eq(sessionRecordings.id, id),
  });
  if (!recording) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const role = await getProjectMembership(session.userId, recording.projectId);
  if (!role) {
    // Don't leak existence to non-members.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const chunks = await db.query.sessionRecordingChunks.findMany({
    where: eq(sessionRecordingChunks.recordingId, id),
    orderBy: asc(sessionRecordingChunks.chunkIndex),
  });

  // Decompress and stitch. Each chunk's `data` is gzipped JSON of an events[].
  const events: unknown[] = [];
  for (const chunk of chunks) {
    try {
      const raw = gunzipSync(chunk.data);
      const parsed = JSON.parse(raw.toString('utf-8'));
      if (Array.isArray(parsed)) events.push(...parsed);
    } catch (error) {
      console.error('[recording] Failed to decompress chunk', chunk.id, error);
    }
  }

  return NextResponse.json({
    recording: {
      id: recording.id,
      sessionId: recording.sessionId,
      distinctId: recording.distinctId,
      startedAt: recording.startedAt.toISOString(),
      endedAt: recording.endedAt?.toISOString() ?? null,
      durationMs: recording.durationMs,
      eventCount: recording.eventCount,
      sizeBytes: recording.sizeBytes,
      startUrl: recording.startUrl,
      browser: recording.browser,
      os: recording.os,
      country: recording.country,
      deviceType: recording.deviceType,
      hasErrors: recording.hasErrors,
    },
    events,
  });
}
