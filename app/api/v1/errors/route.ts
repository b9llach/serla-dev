import { NextRequest, NextResponse } from 'next/server';
import { db, errorGroups, errorEvents, users } from '@/lib/db';
import { validateApiKeyWithLimits } from '@/lib/api/auth';
import { canAccess } from '@/lib/plans/features';
import { rateLimit, rateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { computeFingerprint, parseTopFrame } from '@/lib/errors/fingerprint';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
};

const errorSchema = z.object({
  message: z.string().min(1).max(2000),
  type: z.string().max(100).optional().nullable(),
  stack: z.string().max(20000).optional().nullable(),
  url: z.string().max(2048).optional().nullable(),
  userAgent: z.string().max(500).optional().nullable(),
  distinctId: z.string().max(200).optional().nullable(),
  sessionId: z.string().max(200).optional().nullable(),
  release: z.string().max(100).optional().nullable(),
  environment: z.string().max(50).optional().nullable(),
  level: z.enum(['error', 'warning', 'info']).default('error').optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  timestamp: z.string().datetime().optional().nullable(),
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

    const owner = await db.query.users.findFirst({
      where: and(eq(users.id, project.userId), isNull(users.deletedAt)),
      columns: { plan: true },
    });
    if (!owner || !canAccess('errorTracking', owner.plan)) {
      return NextResponse.json(
        { error: 'Error tracking requires the Hobby plan or above' },
        { status: 402, headers: corsHeaders },
      );
    }

    const rateLimitResult = await rateLimit(`errors:${project.id}`, rateLimits.events);
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
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid error report', details: parsed.error.issues },
        { status: 400, headers: corsHeaders },
      );
    }
    const err = parsed.data;

    const fingerprint = computeFingerprint({
      type: err.type,
      message: err.message,
      stack: err.stack,
    });
    const topFrame = parseTopFrame(err.stack);
    const timestamp = err.timestamp ? new Date(err.timestamp) : new Date();
    const userAgent = err.userAgent || request.headers.get('user-agent') || undefined;
    const { browser, os } = parseBrowserOs(userAgent);

    // Upsert the group. If it exists, bump last_seen + occurrence_count and
    // potentially affected_users (we'll re-derive this from a SELECT below to
    // keep accuracy).
    const groupResult = await db
      .insert(errorGroups)
      .values({
        projectId: project.id,
        fingerprint,
        message: err.message.slice(0, 500),
        type: err.type ?? undefined,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        occurrenceCount: 1,
        // Seeded at 0 on purpose: the increment below runs for this first
        // event too (nothing else in the group shares its distinct_id yet).
        // Seeding 1 here would double-count the very first occurrence.
        affectedUsers: 0,
        release: err.release ?? undefined,
        environment: err.environment ?? undefined,
      })
      .onConflictDoUpdate({
        target: [errorGroups.projectId, errorGroups.fingerprint],
        set: {
          lastSeenAt: timestamp,
          occurrenceCount: sql`${errorGroups.occurrenceCount} + 1`,
          // If group was resolved and we're seeing it again, reopen.
          status: sql`CASE WHEN ${errorGroups.status} = 'resolved' THEN 'unresolved' ELSE ${errorGroups.status} END`,
          resolvedAt: sql`CASE WHEN ${errorGroups.status} = 'resolved' THEN NULL ELSE ${errorGroups.resolvedAt} END`,
        },
      })
      .returning({ id: errorGroups.id });

    const groupId = groupResult[0]?.id;
    if (!groupId) {
      return NextResponse.json(
        { error: 'Failed to upsert error group' },
        { status: 500, headers: corsHeaders },
      );
    }

    const insertedEvent = await db.insert(errorEvents).values({
      groupId,
      projectId: project.id,
      distinctId: err.distinctId ?? undefined,
      sessionId: err.sessionId ?? undefined,
      message: err.message,
      type: err.type ?? undefined,
      stack: err.stack ?? undefined,
      sourceFile: topFrame?.file,
      sourceLine: topFrame?.line ?? undefined,
      sourceColumn: topFrame?.column ?? undefined,
      url: err.url ?? undefined,
      userAgent,
      browser,
      os,
      release: err.release ?? undefined,
      environment: err.environment ?? undefined,
      level: err.level ?? 'error',
      metadata: (err.metadata ?? {}) as Record<string, unknown>,
      timestamp,
    }).returning({ id: errorEvents.id });

    const insertedEventId = insertedEvent[0]?.id;

    // affected_users is recomputed by the daily cron, not here.
    //
    // The previous implementation ran COUNT(DISTINCT distinct_id) across the
    // whole group on every single ingested error. distinct_id isn't in the
    // group index, so each occurrence forced a heap scan of every prior
    // occurrence - meaning the noisiest error was also the most expensive to
    // record, and ingest latency degraded exactly when a customer was on
    // fire. Incrementing on first sight of a distinct_id keeps the common
    // case O(1); the cron corrects any drift.
    if (err.distinctId) {
      await db.execute(sql`
        UPDATE error_groups
        SET affected_users = affected_users + 1
        WHERE id = ${groupId}
          AND NOT EXISTS (
            SELECT 1 FROM error_events
            WHERE group_id = ${groupId}
              AND distinct_id = ${err.distinctId}
              AND id <> ${insertedEventId}
            LIMIT 1
          )
      `);
    }

    return NextResponse.json(
      { success: true, fingerprint },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error('[errors] Ingestion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}

function parseBrowserOs(ua: string | undefined): { browser?: string; os?: string } {
  if (!ua) return {};
  let browser: string | undefined;
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  let os: string | undefined;
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';

  return { browser, os };
}
