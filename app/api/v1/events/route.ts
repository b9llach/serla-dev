import { NextRequest, NextResponse } from 'next/server';
import { db, events, sessions, dailyUserSeen } from '@/lib/db';
import { validateApiKeyWithLimits } from '@/lib/api/auth';
import { enrichEvent, generateSessionId } from '@/lib/api/enrichment';
import { rateLimit, rateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { publishEvent } from '@/lib/redis';
import { triggerWebhooks } from '@/lib/webhooks/deliver';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
};

const eventSchema = z.object({
  name: z.string().min(1, 'Event name is required'),
  properties: z.record(z.string(), z.unknown()).optional().nullable().default({}),
  timestamp: z.string().datetime().optional().nullable(),
  distinctId: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
  pageUrl: z.string().optional().nullable(),
  pagePath: z.string().optional().nullable(),
  pageTitle: z.string().optional().nullable(),
  referrer: z.string().optional().nullable(),
  clickX: z.number().optional().nullable(),
  clickY: z.number().optional().nullable(),
  elementSelector: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    // Validate API key and check usage limits
    const authHeader = request.headers.get('authorization');
    const { valid, project, withinLimits, limitError } = await validateApiKeyWithLimits(authHeader);

    if (!valid || !project) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Per-minute rate limiting
    const rateLimitResult = await rateLimit(`events:${project.id}`, rateLimits.events);
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    // Check if within plan limits
    if (!withinLimits) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', message: limitError },
        { status: 429, headers: corsHeaders }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const result = eventSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid event data', details: result.error.issues },
        { status: 400, headers: corsHeaders }
      );
    }

    const eventData = result.data;

    // Enrich event with device, geo, UTM data
    const userAgent = request.headers.get('user-agent');
    const enrichment = enrichEvent(
      userAgent,
      eventData.pageUrl || null,
      eventData.referrer || null,
      request.headers
    );

    // Handle session. Validate client-provided sessionId to prevent cross-user
    // session pollution: an attacker who learns another user's sessionId could
    // otherwise inject their own events into that user's analytics.
    let sessionId = eventData.sessionId;
    const SESSION_ID_RE = /^[a-f0-9]{32}$/i; // matches generateSessionId() output
    if (sessionId && !SESSION_ID_RE.test(sessionId)) {
      // Malformed - issue a new one
      sessionId = generateSessionId();
    } else if (sessionId) {
      // If this sessionId exists in another project, generate a new one
      // rather than letting cross-project pollution slip through.
      const existing = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        columns: { id: true, projectId: true },
      });
      if (existing && existing.projectId !== project.id) {
        sessionId = generateSessionId();
      }
    }
    if (!sessionId) {
      sessionId = generateSessionId();
    }

    // Atomic upsert with SQL-side increment - no lost updates under concurrency.
    await db.insert(sessions)
      .values({
        id: sessionId,
        projectId: project.id,
        distinctId: eventData.distinctId,
        entryPage: eventData.pagePath,
        exitPage: eventData.pagePath,
        referrer: eventData.referrer,
        utmSource: enrichment.utmSource,
        utmMedium: enrichment.utmMedium,
        utmCampaign: enrichment.utmCampaign,
        country: enrichment.country,
        browser: enrichment.browser,
        os: enrichment.os,
        deviceType: enrichment.deviceType,
        eventCount: 1,
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          lastSeenAt: new Date(),
          eventCount: sql`${sessions.eventCount} + 1`,
          // COALESCE: only overwrite if a non-null value is provided on this event.
          exitPage: sql`COALESCE(${eventData.pagePath ?? null}, ${sessions.exitPage})`,
          distinctId: sql`COALESCE(${eventData.distinctId ?? null}, ${sessions.distinctId})`,
        },
      });

    // Insert event
    const eventTimestamp = eventData.timestamp ? new Date(eventData.timestamp) : new Date();
    const [insertedEvent] = await db.insert(events).values({
      projectId: project.id,
      sessionId,
      distinctId: eventData.distinctId,
      name: eventData.name,
      properties: eventData.properties,
      timestamp: eventTimestamp,
      pageUrl: eventData.pageUrl,
      pagePath: eventData.pagePath,
      pageTitle: eventData.pageTitle,
      referrer: eventData.referrer,
      clickX: eventData.clickX,
      clickY: eventData.clickY,
      elementSelector: eventData.elementSelector,
      ...enrichment,
    }).returning({ id: events.id });

    // Maintain per-day unique-user counter. The daily aggregation cron reads
    // this with a simple COUNT(*) instead of COUNT(DISTINCT) over the events
    // table - which scales linearly with unique users rather than total events.
    if (eventData.distinctId) {
      const eventDateStr = eventTimestamp.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
      await db.insert(dailyUserSeen)
        .values({
          projectId: project.id,
          date: eventDateStr,
          distinctId: eventData.distinctId,
        })
        .onConflictDoNothing();
    }

    // Build event object for publishing
    const eventPayload = {
      id: insertedEvent.id,
      name: eventData.name,
      distinctId: eventData.distinctId,
      sessionId,
      timestamp: eventTimestamp.toISOString(),
      properties: eventData.properties,
      pagePath: eventData.pagePath,
      pageUrl: eventData.pageUrl,
      country: enrichment.country,
      browser: enrichment.browser,
      device: enrichment.deviceType,
      deviceType: enrichment.deviceType,
    };

    // Publish real-time event to connected clients via Redis
    await publishEvent(project.id, eventPayload);

    // Trigger webhooks
    try {
      await triggerWebhooks(project.id, {
        id: insertedEvent.id,
        name: eventData.name,
        distinctId: eventData.distinctId || null,
        timestamp: eventTimestamp.toISOString(),
        properties: (eventData.properties || {}) as Record<string, unknown>,
        country: enrichment.country,
        browser: enrichment.browser,
        device: enrichment.deviceType,
        pageUrl: eventData.pageUrl,
      });
    } catch (err) {
      console.error('Webhook trigger error:', err);
    }

    return NextResponse.json(
      { success: true, eventId: insertedEvent.id, sessionId },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Event ingestion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}
