import { NextRequest, NextResponse } from 'next/server';
import { db, events, projects } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { rateLimit, rateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { eq, and, gte, lte, desc, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit by user (export is expensive)
    const rateLimitResult = await rateLimit(`export-internal:${session.userId}`, rateLimits.export);
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const format = searchParams.get('format') || 'json';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const eventName = searchParams.get('eventName');
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 10000);

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    // Verify project ownership
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.userId, session.userId),
        isNull(projects.deletedAt)
      ),
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Build query conditions
    const conditions = [eq(events.projectId, projectId)];

    if (startDate) {
      conditions.push(gte(events.timestamp, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(events.timestamp, new Date(endDate)));
    }
    if (eventName && eventName !== 'all') {
      conditions.push(eq(events.name, eventName));
    }

    const eventList = await db.query.events.findMany({
      where: and(...conditions),
      orderBy: desc(events.timestamp),
      limit,
    });

    if (format === 'csv') {
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

    return NextResponse.json({
      events: eventList,
      count: eventList.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
