import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, projects, events } from '@/lib/db';
import { eq, desc, gt, and } from 'drizzle-orm';
import { getCurrentProject } from '@/lib/utils/project';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's selected project (respects cookie)
  const project = await getCurrentProject(session.userId);

  if (!project) {
    return NextResponse.json({ error: 'No project found' }, { status: 404 });
  }

  // Get the 'since' timestamp from query params
  const since = request.nextUrl.searchParams.get('since');
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 30000); // Default to last 30 seconds

  // Fetch recent events since the timestamp (max 50)
  const recentEvents = await db.query.events.findMany({
    where: and(
      eq(events.projectId, project.id),
      gt(events.timestamp, sinceDate)
    ),
    orderBy: [desc(events.timestamp)],
    limit: 50,
  });

  // Transform events for the client
  const transformedEvents = recentEvents.map(event => ({
    id: event.id,
    name: event.name,
    distinctId: event.distinctId,
    sessionId: event.sessionId,
    timestamp: event.timestamp.toISOString(),
    properties: event.properties,
    pagePath: event.pagePath,
    pageUrl: event.pageUrl,
    country: event.country,
    browser: event.browser,
    deviceType: event.deviceType,
  }));

  return NextResponse.json({
    projectId: project.id,
    events: transformedEvents,
    serverTime: new Date().toISOString(),
  });
}
