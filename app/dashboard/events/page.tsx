import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Activity',
};

// Activity is a debugging surface - it must always reflect what's actually
// in the events table. force-dynamic prevents Next.js/Vercel from serving
// a cached render after the user has just sent fresh events from a client.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { db, events, projects } from '@/lib/db';
import { eq, and, desc, ilike, gte, lte, lt, count } from 'drizzle-orm';
import { getCurrentProject } from '@/lib/utils/project';
import { redirect } from 'next/navigation';
import { EventsTable } from '@/components/dashboard/events-table';
import { EventFilters } from '@/components/dashboard/event-filters';

interface Props {
  searchParams: Promise<{
    name?: string;
    startDate?: string;
    endDate?: string;
  }>;
}

async function getEvents(projectId: string, filters: {
  name?: string;
  startDate?: string;
  endDate?: string;
}) {
  const conditions = [eq(events.projectId, projectId)];
  const countConditions = [eq(events.projectId, projectId)];

  if (filters.name) {
    conditions.push(ilike(events.name, `%${filters.name}%`));
    countConditions.push(ilike(events.name, `%${filters.name}%`));
  }
  if (filters.startDate) {
    conditions.push(gte(events.timestamp, new Date(filters.startDate)));
    countConditions.push(gte(events.timestamp, new Date(filters.startDate)));
  }
  if (filters.endDate) {
    conditions.push(lte(events.timestamp, new Date(filters.endDate)));
    countConditions.push(lte(events.timestamp, new Date(filters.endDate)));
  }

  const [eventList, eventNames, totalResult] = await Promise.all([
    db.query.events.findMany({
      where: and(...conditions),
      orderBy: desc(events.timestamp),
      limit: 50,
    }),
    db
      .selectDistinct({ name: events.name })
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(events.name),
    db
      .select({ count: count() })
      .from(events)
      .where(and(...countConditions)),
  ]);

  return {
    events: eventList,
    eventNames: eventNames.map(e => e.name),
    hasMore: eventList.length === 50,
    nextCursor: eventList.length > 0 ? eventList[eventList.length - 1].timestamp.toISOString() : null,
    totalCount: Number(totalResult[0]?.count || 0),
  };
}

export default async function EventsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const params = await searchParams;

  const project = await getCurrentProject(session.userId);

  if (!project) {
    return (
      <div className="h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Activity</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const data = await getEvents(project.id, params);

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl mx-auto flex flex-col flex-1 min-h-0">
        {/* Header - fixed */}
        <div className="shrink-0 mb-4">
          <h1 className="text-2xl font-bold">Activity</h1>
          <p className="text-muted-foreground">
            Raw event log - useful for debugging integrations and verifying tracking
          </p>
        </div>

        {/* Filters - fixed */}
        <div className="shrink-0 mb-4">
          <EventFilters
            eventNames={data.eventNames}
            currentName={params.name}
            startDate={params.startDate}
            endDate={params.endDate}
          />
        </div>

        {/* Events table - scrollable */}
        <EventsTable
          events={data.events}
          hasMore={data.hasMore}
          nextCursor={data.nextCursor}
          totalCount={data.totalCount}
          filters={{
            name: params.name,
            startDate: params.startDate,
            endDate: params.endDate,
          }}
        />
      </div>
    </div>
  );
}
