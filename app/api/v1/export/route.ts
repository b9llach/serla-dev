import { NextRequest, NextResponse } from 'next/server';
import { db, events } from '@/lib/db';
import { validateApiKey } from '@/lib/api/auth';
import { rateLimit, rateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { z } from 'zod';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

const exportSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  startDate: z.string().datetime().optional().refine(
    s => !s || (new Date(s).getTime() > Date.now() - 5 * 365 * 24 * 60 * 60 * 1000),
    'startDate cannot be more than 5 years ago'
  ),
  endDate: z.string().datetime().optional().refine(
    s => !s || (new Date(s).getTime() <= Date.now() + 24 * 60 * 60 * 1000),
    'endDate cannot be in the future'
  ),
  eventName: z.string().optional(),
  limit: z.coerce.number().min(1).max(10000).default(1000),
});

export async function GET(request: NextRequest) {
  try {
    // Export reads raw event data back out, so it requires a SECRET key.
    // Public (pk_live_) keys are designed to be embedded in browser bundles
    // where any visitor can read them - if they were accepted here, anyone
    // could scrape a customer's entire event history straight from their
    // site's JavaScript.
    const authHeader = request.headers.get('authorization');
    const { valid, project, insufficientScope } = await validateApiKey(authHeader, {
      requiredScope: 'secret',
    });

    if (insufficientScope) {
      return NextResponse.json(
        {
          error: 'This endpoint requires a secret key',
          message:
            'Public keys (pk_live_...) cannot read data. Create a secret key ' +
            'in Settings > API Keys and use it only from a server.',
        },
        { status: 403 }
      );
    }

    if (!valid || !project) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Rate limit: export is expensive, hard-cap to 10/min per project.
    const rateLimitResult = await rateLimit(`export:${project.id}`, rateLimits.export);
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const params = {
      format: searchParams.get('format') || 'json',
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      eventName: searchParams.get('eventName'),
      limit: searchParams.get('limit') || '1000',
    };

    const result = exportSchema.safeParse(params);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: result.error.issues },
        { status: 400 }
      );
    }

    const { format, startDate, endDate, eventName, limit } = result.data;

    // Build query conditions
    const conditions = [eq(events.projectId, project.id)];

    if (startDate) {
      conditions.push(gte(events.timestamp, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(events.timestamp, new Date(endDate)));
    }
    if (eventName) {
      conditions.push(eq(events.name, eventName));
    }

    // Query events
    const eventList = await db.query.events.findMany({
      where: and(...conditions),
      orderBy: desc(events.timestamp),
      limit,
    });

    if (format === 'csv') {
      // Convert to CSV
      const headers = [
        'id', 'name', 'timestamp', 'distinctId', 'sessionId',
        'pageUrl', 'pagePath', 'country', 'browser', 'os', 'deviceType',
        'utmSource', 'utmMedium', 'utmCampaign', 'properties'
      ];

      const rows = eventList.map(event => [
        event.id,
        event.name,
        event.timestamp.toISOString(),
        event.distinctId || '',
        event.sessionId || '',
        event.pageUrl || '',
        event.pagePath || '',
        event.country || '',
        event.browser || '',
        event.os || '',
        event.deviceType || '',
        event.utmSource || '',
        event.utmMedium || '',
        event.utmCampaign || '',
        JSON.stringify(event.properties),
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="events-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Return JSON
    return NextResponse.json({
      events: eventList,
      count: eventList.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
