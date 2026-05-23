'use server';

import { db, events, projects } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { eq, and, desc, ilike, gte, lte, lt } from 'drizzle-orm';

const LIMIT = 50;

export async function loadMoreEvents(filters: {
  cursor: string;
  name?: string;
  startDate?: string;
  endDate?: string;
}) {
  const session = await getSession();
  if (!session) {
    return { events: [], hasMore: false, nextCursor: null };
  }

  const userProjects = await db.query.projects.findMany({
    where: eq(projects.userId, session.userId),
    limit: 1,
  });

  if (userProjects.length === 0) {
    return { events: [], hasMore: false, nextCursor: null };
  }

  const projectId = userProjects[0].id;
  const conditions = [
    eq(events.projectId, projectId),
    lt(events.timestamp, new Date(filters.cursor)),
  ];

  if (filters.name) {
    conditions.push(ilike(events.name, `%${filters.name}%`));
  }
  if (filters.startDate) {
    conditions.push(gte(events.timestamp, new Date(filters.startDate)));
  }
  if (filters.endDate) {
    conditions.push(lte(events.timestamp, new Date(filters.endDate)));
  }

  const eventList = await db.query.events.findMany({
    where: and(...conditions),
    orderBy: desc(events.timestamp),
    limit: LIMIT,
  });

  return {
    events: eventList,
    hasMore: eventList.length === LIMIT,
    nextCursor: eventList.length > 0
      ? eventList[eventList.length - 1].timestamp.toISOString()
      : null,
  };
}
