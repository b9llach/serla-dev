import { NextRequest, NextResponse } from 'next/server';
import { db, events, sessions, dailyUserSeen } from '@/lib/db';
import { validateApiKeyWithLimits } from '@/lib/api/auth';
import { enrichEvent, generateSessionId } from '@/lib/api/enrichment';
import { rateLimit, rateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { publishEvent } from '@/lib/redis';
import { triggerWebhooks } from '@/lib/webhooks/deliver';
import { z } from 'zod';
import { inArray, sql } from 'drizzle-orm';

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

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    // Validate API key. Prefer Authorization header. Fall back to ?api_key=
    // ONLY because navigator.sendBeacon() cannot set request headers - this
    // is the documented escape hatch for browser-side pageleave tracking.
    // Tradeoff: query params can appear in proxy access logs and browser
    // history. Server-side callers should always use the header.
    let authHeader = request.headers.get('authorization');
    const apiKeyParam = request.nextUrl.searchParams.get('api_key');
    if (!authHeader && apiKeyParam) {
      authHeader = `Bearer ${apiKeyParam}`;
    }
    const { valid, project, withinLimits, limitError } = await validateApiKeyWithLimits(authHeader);

    if (!valid || !project) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Per-minute rate limiting (stricter for batch)
    const rateLimitResult = await rateLimit(`batch:${project.id}`, rateLimits.batchEvents);
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
    const result = batchSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid batch data', details: result.error.issues },
        { status: 400, headers: corsHeaders }
      );
    }

    const { events: eventList } = result.data;

    // Enrich with user agent and geo data
    const userAgent = request.headers.get('user-agent');
    const baseEnrichment = enrichEvent(
      userAgent,
      null,
      null,
      request.headers
    );

    // Validate client-provided sessionIds: reject malformed ones, and detect
    // ones that exist in another project (cross-project pollution attempt).
    // Done once per batch by collecting all candidate IDs and doing a single query.
    const SESSION_ID_RE = /^[a-f0-9]{32}$/i;
    const candidateSessionIds = new Set<string>();
    for (const eventData of eventList) {
      if (eventData.sessionId && SESSION_ID_RE.test(eventData.sessionId)) {
        candidateSessionIds.add(eventData.sessionId);
      }
    }
    const foreignSessions = candidateSessionIds.size > 0
      ? await db.query.sessions.findMany({
          where: inArray(sessions.id, Array.from(candidateSessionIds)),
          columns: { id: true, projectId: true },
        })
      : [];
    const foreignSessionIds = new Set(
      foreignSessions.filter(s => s.projectId !== project.id).map(s => s.id)
    );

    // Group events by session
    const sessionUpdates = new Map<string, { count: number; lastPage?: string; distinctId?: string }>();
    const eventsToInsert: (typeof events.$inferInsert)[] = [];

    for (const eventData of eventList) {
      let sessionId = eventData.sessionId;
      if (sessionId && (!SESSION_ID_RE.test(sessionId) || foreignSessionIds.has(sessionId))) {
        // Malformed or belongs to another project - issue a fresh one.
        sessionId = generateSessionId();
      }
      if (!sessionId) {
        sessionId = generateSessionId();
      }

      // Track session updates
      const sessionInfo = sessionUpdates.get(sessionId) || { count: 0 };
      sessionInfo.count++;
      if (eventData.pagePath) sessionInfo.lastPage = eventData.pagePath;
      if (eventData.distinctId) sessionInfo.distinctId = eventData.distinctId;
      sessionUpdates.set(sessionId, sessionInfo);

      // Additional enrichment per event
      const eventEnrichment = enrichEvent(
        userAgent,
        eventData.pageUrl || null,
        eventData.referrer || null,
        request.headers
      );

      eventsToInsert.push({
        projectId: project.id,
        sessionId,
        distinctId: eventData.distinctId,
        name: eventData.name,
        properties: eventData.properties,
        timestamp: eventData.timestamp ? new Date(eventData.timestamp) : new Date(),
        pageUrl: eventData.pageUrl,
        pagePath: eventData.pagePath,
        pageTitle: eventData.pageTitle,
        referrer: eventData.referrer,
        clickX: eventData.clickX,
        clickY: eventData.clickY,
        elementSelector: eventData.elementSelector,
        ...baseEnrichment,
        ...eventEnrichment,
      });
    }

    // Build session upsert rows - one row per unique session in this batch.
    // ON CONFLICT atomically increments the eventCount with this batch's delta,
    // so concurrent batches for the same session can't lose updates.
    const sessionUpsertRows = Array.from(sessionUpdates.entries()).map(([sessionId, info]) => {
      const firstEvent = eventsToInsert.find(e => e.sessionId === sessionId);
      return {
        id: sessionId,
        projectId: project.id,
        distinctId: info.distinctId,
        entryPage: firstEvent?.pagePath,
        exitPage: info.lastPage,
        referrer: firstEvent?.referrer,
        utmSource: firstEvent?.utmSource,
        utmMedium: firstEvent?.utmMedium,
        utmCampaign: firstEvent?.utmCampaign,
        country: baseEnrichment.country,
        browser: baseEnrichment.browser,
        os: baseEnrichment.os,
        deviceType: baseEnrichment.deviceType,
        eventCount: info.count,
      };
    });

    // Build the unique-user-per-day counter rows. Dedup within this batch
    // (one row per (project, day, distinctId)) so we only emit one upsert.
    const userSeenKeys = new Set<string>();
    const userSeenRows: { projectId: string; date: string; distinctId: string }[] = [];
    for (const e of eventsToInsert) {
      if (!e.distinctId) continue;
      const ts = e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp ?? Date.now());
      const dateStr = ts.toISOString().slice(0, 10);
      const key = `${dateStr}:${e.distinctId}`;
      if (userSeenKeys.has(key)) continue;
      userSeenKeys.add(key);
      userSeenRows.push({ projectId: project.id, date: dateStr, distinctId: e.distinctId });
    }

    // Do all DB writes first - events + sessions. If either fails, we return
    // an error to the client and no webhooks fire. If both succeed, fire
    // webhooks and publish to realtime.
    await db.insert(events).values(eventsToInsert);
    if (userSeenRows.length > 0) {
      await db.insert(dailyUserSeen).values(userSeenRows).onConflictDoNothing();
    }
    if (sessionUpsertRows.length > 0) {
      await db.insert(sessions)
        .values(sessionUpsertRows)
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            lastSeenAt: new Date(),
            eventCount: sql`${sessions.eventCount} + EXCLUDED.event_count`,
            exitPage: sql`COALESCE(EXCLUDED.exit_page, ${sessions.exitPage})`,
            distinctId: sql`COALESCE(EXCLUDED.distinct_id, ${sessions.distinctId})`,
          },
        });
    }

    // Post-commit side effects: realtime publish + webhook triggers.
    for (let i = 0; i < eventsToInsert.length; i++) {
      const event = eventsToInsert[i];
      const eventId = `${event.projectId}-${Date.now()}-${i}`;
      const timestamp = event.timestamp instanceof Date
        ? event.timestamp.toISOString()
        : (event.timestamp ?? new Date().toISOString());

      await publishEvent(project.id, {
        id: eventId,
        name: event.name,
        distinctId: event.distinctId,
        sessionId: event.sessionId,
        timestamp,
        properties: event.properties,
        pagePath: event.pagePath,
        pageUrl: event.pageUrl,
        country: event.country,
        browser: event.browser,
        deviceType: event.deviceType,
      });

      triggerWebhooks(project.id, {
        id: eventId,
        name: event.name,
        distinctId: event.distinctId || null,
        timestamp,
        properties: (event.properties || {}) as Record<string, unknown>,
        country: event.country,
        browser: event.browser,
        device: event.deviceType,
        pageUrl: event.pageUrl,
      }).catch(err => console.error('Webhook trigger error:', err));
    }

    return NextResponse.json(
      { success: true, count: eventsToInsert.length },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Batch event ingestion error:', error);
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
