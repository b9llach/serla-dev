import { db, events } from '@/lib/db';
import { eq, and, gte, sql, desc } from 'drizzle-orm';

export interface DiscoveredProperty {
  name: string;
  eventName: string;
  type: 'number' | 'string' | 'boolean';
  sampleValues: (string | number | boolean)[];
  count: number;
}

export interface DiscoveredEvent {
  name: string;
  count: number;
  lastSeen: Date;
  numericProperties: string[];
}

/**
 * Discover all unique event names and their counts for a project
 */
export async function discoverEvents(projectId: string, days: number = 30): Promise<DiscoveredEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const eventStats = await db
    .select({
      name: events.name,
      count: sql<number>`count(*)`,
      lastSeen: sql<Date>`max(${events.timestamp})`,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, projectId),
        gte(events.timestamp, since)
      )
    )
    .groupBy(events.name)
    .orderBy(desc(sql`count(*)`));

  // For each event, discover numeric properties
  const eventsWithProps = await Promise.all(
    eventStats.map(async (event) => {
      const numericProps = await discoverNumericProperties(projectId, event.name, days);
      return {
        name: event.name,
        count: Number(event.count),
        lastSeen: event.lastSeen,
        numericProperties: numericProps,
      };
    })
  );

  return eventsWithProps;
}

/**
 * Discover numeric properties for a specific event
 */
export async function discoverNumericProperties(
  projectId: string,
  eventName: string,
  days: number = 30
): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Get a sample of events to analyze their properties
  const sampleEvents = await db.query.events.findMany({
    where: and(
      eq(events.projectId, projectId),
      eq(events.name, eventName),
      gte(events.timestamp, since)
    ),
    limit: 100,
    orderBy: desc(events.timestamp),
  });

  // Analyze properties to find numeric ones
  const propertyTypes = new Map<string, Set<string>>();

  for (const event of sampleEvents) {
    const props = event.properties as Record<string, unknown>;
    if (!props || typeof props !== 'object') continue;

    for (const [key, value] of Object.entries(props)) {
      if (!propertyTypes.has(key)) {
        propertyTypes.set(key, new Set());
      }

      const typeSet = propertyTypes.get(key)!;
      if (typeof value === 'number') {
        typeSet.add('number');
      } else if (typeof value === 'string') {
        // Check if string is actually a number
        const num = parseFloat(value);
        if (!isNaN(num)) {
          typeSet.add('number');
        } else {
          typeSet.add('string');
        }
      } else if (typeof value === 'boolean') {
        typeSet.add('boolean');
      }
    }
  }

  // Return properties that are consistently numeric
  const numericProps: string[] = [];
  for (const [key, types] of propertyTypes) {
    if (types.has('number') && !types.has('string')) {
      numericProps.push(key);
    }
  }

  return numericProps;
}

// Allowed property name pattern - alphanumeric, underscores, dashes only
const SAFE_PROPERTY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

function validatePropertyName(property: string): boolean {
  return SAFE_PROPERTY_PATTERN.test(property) && property.length <= 100;
}

/**
 * Get aggregated value for a property
 */
export async function aggregateProperty(
  projectId: string,
  eventName: string,
  property: string,
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count',
  days: number | null = 7
): Promise<number> {
  const baseConditions = [
    eq(events.projectId, projectId),
    eq(events.name, eventName),
  ];

  // null means "all time" - no lower bound on timestamp.
  if (days !== null) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    baseConditions.push(gte(events.timestamp, since));
  }

  if (aggregation === 'count') {
    const result = await db
      .select({ value: sql<number>`count(*)` })
      .from(events)
      .where(and(...baseConditions));
    return Number(result[0]?.value || 0);
  }

  // Validate property name to prevent SQL injection
  if (!validatePropertyName(property)) {
    throw new Error('Invalid property name');
  }

  // Validate aggregation function is one of the allowed values
  const allowedAggFunctions = ['sum', 'avg', 'min', 'max'] as const;
  if (!allowedAggFunctions.includes(aggregation as typeof allowedAggFunctions[number])) {
    throw new Error('Invalid aggregation function');
  }

  // Use parameterized query for the property name
  const result = await db
    .select({
      value: sql<number>`${sql.raw(aggregation)}((${events.properties}->>${sql.param(property)})::numeric)`
    })
    .from(events)
    .where(and(...baseConditions));

  return Number(result[0]?.value || 0);
}

/**
 * Get daily trend for a property aggregation
 */
export async function getPropertyTrend(
  projectId: string,
  eventName: string,
  property: string,
  aggregation: 'sum' | 'avg' | 'count',
  days: number = 7
): Promise<{ date: string; value: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const baseConditions = [
    eq(events.projectId, projectId),
    eq(events.name, eventName),
    gte(events.timestamp, since),
  ];

  let selectValue;
  if (aggregation === 'count') {
    selectValue = sql<number>`count(*)`;
  } else {
    // Validate property name to prevent SQL injection
    if (!validatePropertyName(property)) {
      throw new Error('Invalid property name');
    }

    if (aggregation === 'sum') {
      selectValue = sql<number>`coalesce(sum((${events.properties}->>${sql.param(property)})::numeric), 0)`;
    } else {
      selectValue = sql<number>`coalesce(avg((${events.properties}->>${sql.param(property)})::numeric), 0)`;
    }
  }

  const result = await db
    .select({
      date: sql<string>`date_trunc('day', ${events.timestamp})::date`,
      value: selectValue,
    })
    .from(events)
    .where(and(...baseConditions))
    .groupBy(sql`date_trunc('day', ${events.timestamp})::date`)
    .orderBy(sql`date_trunc('day', ${events.timestamp})::date`);

  return result.map(r => ({
    date: String(r.date),
    value: Number(r.value),
  }));
}
