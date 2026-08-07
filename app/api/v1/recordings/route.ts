import { NextRequest, NextResponse } from 'next/server';
import { gzipSync } from 'zlib';
import { db, sessionRecordings, sessionRecordingChunks, users } from '@/lib/db';
import { validateApiKeyWithLimits } from '@/lib/api/auth';
import { canAccess } from '@/lib/plans/features';
import { rateLimit, rateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
};

// Each event has a `timestamp` field; we just need enough shape to pull
// per-chunk start/end times. The full event body is opaque to the server.
const rrwebEventSchema = z.object({
  timestamp: z.number(),
}).passthrough();

const chunkSchema = z.object({
  sessionId: z.string().min(1).max(200),
  distinctId: z.string().max(200).optional().nullable(),
  chunkIndex: z.number().int().min(0),
  events: z.array(rrwebEventSchema).min(1).max(1000),
  // Optional context for the first chunk so we can populate session_recording columns.
  startUrl: z.string().max(2048).optional().nullable(),
  browser: z.string().max(100).optional().nullable(),
  os: z.string().max(100).optional().nullable(),
  deviceType: z.string().max(20).optional().nullable(),
  hasError: z.boolean().optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { valid, project, withinLimits, limitError } = await validateApiKeyWithLimits(authHeader);
    if (!valid || !project) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders },
      );
    }

    // Plan gating: project owner's plan must include sessionReplay.
    const owner = await db.query.users.findFirst({
      where: and(eq(users.id, project.userId), isNull(users.deletedAt)),
      columns: { plan: true },
    });
    if (!owner || !canAccess('sessionReplay', owner.plan)) {
      return NextResponse.json(
        { error: 'Session replay requires the Hobby plan or above' },
        { status: 402, headers: corsHeaders },
      );
    }

    const rateLimitResult = await rateLimit(`recordings:${project.id}`, rateLimits.events);
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    // Monthly plan volume applies to these writes too - otherwise replay
    // blobs, error events and LLM rows are an uncapped storage cost on
    // every tier while only /events counts toward the quota.
    if (!withinLimits) {
      return NextResponse.json(
        { error: 'Monthly limit exceeded', message: limitError },
        { status: 429, headers: corsHeaders },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: corsHeaders },
      );
    }

    const parsed = chunkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid chunk', details: parsed.error.issues },
        { status: 400, headers: corsHeaders },
      );
    }
    const chunk = parsed.data;

    const rawJson = JSON.stringify(chunk.events);
    const uncompressedSize = Buffer.byteLength(rawJson, 'utf-8');
    // Hard cap to keep one row reasonable. The SDK should flush before this.
    if (uncompressedSize > 2_000_000) {
      return NextResponse.json(
        { error: 'Chunk too large (>2MB uncompressed)' },
        { status: 413, headers: corsHeaders },
      );
    }
    const compressed = gzipSync(rawJson);

    const rawStart = Math.min(...chunk.events.map(e => Number(e.timestamp)));
    const rawEnd = Math.max(...chunk.events.map(e => Number(e.timestamp)));
    // Clamp client-supplied epoch-ms into a sane window. Unbounded values
    // produce Invalid Date (RangeError on insert) and overflow the integer
    // duration column, both of which surface as a 500 from a public endpoint.
    const MAX_EPOCH_MS = 8.64e15;
    if (
      !Number.isFinite(rawStart) ||
      !Number.isFinite(rawEnd) ||
      Math.abs(rawStart) > MAX_EPOCH_MS ||
      Math.abs(rawEnd) > MAX_EPOCH_MS
    ) {
      return NextResponse.json(
        { error: 'Invalid event timestamps' },
        { status: 400, headers: corsHeaders },
      );
    }
    const startTime = rawStart;
    const endTime = rawEnd;
    // duration_ms is an integer column - cap at its ceiling (~24.8 days).
    const durationMs = Math.max(0, Math.min(endTime - startTime, 2_147_483_647));

    // Create the parent recording if this is the first chunk we've seen for
    // the session. Totals are NOT accumulated here - see the second update
    // below, which only runs when the chunk was genuinely new.
    const recordingInsert = await db
      .insert(sessionRecordings)
      .values({
        projectId: project.id,
        sessionId: chunk.sessionId,
        distinctId: chunk.distinctId ?? undefined,
        startedAt: new Date(startTime),
        endedAt: new Date(endTime),
        durationMs,
        sizeBytes: 0,
        eventCount: 0,
        startUrl: chunk.startUrl ?? undefined,
        browser: chunk.browser ?? undefined,
        os: chunk.os ?? undefined,
        deviceType: chunk.deviceType ?? undefined,
        hasErrors: false,
      })
      .onConflictDoUpdate({
        target: [sessionRecordings.projectId, sessionRecordings.sessionId],
        // No-op update purely so the statement RETURNs the existing row's id.
        set: { sessionId: chunk.sessionId },
      })
      .returning({ id: sessionRecordings.id });

    const recordingId = recordingInsert[0]?.id;
    if (!recordingId) {
      return NextResponse.json(
        { error: 'Failed to upsert recording' },
        { status: 500, headers: corsHeaders },
      );
    }

    // Cap total recording size. The per-chunk limit above bounds one request,
    // but nothing bounded a session's total until now - a multi-hour tab (or
    // a scripted client) could grow a recording without limit, and playback
    // decompresses the whole thing into memory at once. size_bytes and
    // event_count are also integer columns that overflow near 2.1B.
    const MAX_RECORDING_BYTES = 200 * 1024 * 1024; // 200MB uncompressed
    const MAX_RECORDING_EVENTS = 500_000;
    const [totals] = await db
      .select({ sizeBytes: sessionRecordings.sizeBytes, eventCount: sessionRecordings.eventCount })
      .from(sessionRecordings)
      .where(eq(sessionRecordings.id, recordingId))
      .limit(1);
    if (
      totals &&
      (totals.sizeBytes + uncompressedSize > MAX_RECORDING_BYTES ||
        totals.eventCount + chunk.events.length > MAX_RECORDING_EVENTS)
    ) {
      // Accept the request so the SDK doesn't retry forever, but stop storing.
      return NextResponse.json(
        {
          success: true,
          recordingId,
          truncated: true,
          message: 'Recording reached its size limit; further chunks are ignored.',
        },
        { status: 200, headers: corsHeaders },
      );
    }

    // Insert the chunk first. A duplicate (recording_id, chunk_index) returns
    // no rows, which tells us this was a retry of an already-stored chunk.
    const chunkInsert = await db
      .insert(sessionRecordingChunks)
      .values({
        recordingId,
        chunkIndex: chunk.chunkIndex,
        data: compressed,
        uncompressedSize,
        startTime,
        endTime,
        eventsCount: chunk.events.length,
      })
      .onConflictDoNothing()
      .returning({ id: sessionRecordingChunks.id });

    const isNewChunk = chunkInsert.length > 0;

    // Only roll the counters forward for genuinely new chunks. The SDK
    // retries on pagehide via keepalive, so without this guard a normal
    // retry inflates size_bytes and event_count on every resend (and pushes
    // both integer columns toward overflow).
    if (isNewChunk) {
      await db
        .update(sessionRecordings)
        .set({
          endedAt: new Date(endTime),
          durationMs: sql`LEAST(GREATEST(${sessionRecordings.durationMs}, ${durationMs}), 2147483647)`,
          sizeBytes: sql`${sessionRecordings.sizeBytes} + ${uncompressedSize}`,
          eventCount: sql`${sessionRecordings.eventCount} + ${chunk.events.length}`,
          hasErrors: sql`${sessionRecordings.hasErrors} OR ${chunk.hasError ?? false}`,
        })
        .where(eq(sessionRecordings.id, recordingId));
    }

    return NextResponse.json(
      { success: true, recordingId, duplicate: !isNewChunk },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error('[recordings] Ingestion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
