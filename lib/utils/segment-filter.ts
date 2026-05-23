import { events } from '@/lib/db';
import { and, or, eq, like, notLike, sql, SQL } from 'drizzle-orm';

/**
 * Allowed segment fields. Must exactly match column names on the events table.
 * Whitelist-driven to prevent users from filtering on arbitrary columns.
 */
const FIELD_MAP = {
  country: events.country,
  browser: events.browser,
  os: events.os,
  deviceType: events.deviceType,
  utmSource: events.utmSource,
  utmMedium: events.utmMedium,
  utmCampaign: events.utmCampaign,
  referrerDomain: events.referrerDomain,
} as const;

const ALLOWED_OPS = ['equals', 'not_equals', 'contains', 'not_contains'] as const;

export interface SegmentCondition {
  field: string;
  operator: string;
  value: string;
}

export interface SegmentFilters {
  logic?: 'and' | 'or';
  conditions: SegmentCondition[];
}

/**
 * Convert a segment.filters JSON object to a Drizzle SQL condition over the
 * events table. Returns undefined if the segment has no usable conditions.
 *
 * The returned SQL can be safely AND-merged with other WHERE clauses.
 */
export function segmentFiltersToSql(filters: SegmentFilters | null | undefined): SQL | undefined {
  if (!filters || !Array.isArray(filters.conditions)) return undefined;

  const conds: SQL[] = [];
  for (const c of filters.conditions) {
    if (!c || typeof c !== 'object') continue;
    if (!ALLOWED_OPS.includes(c.operator as (typeof ALLOWED_OPS)[number])) continue;
    if (!c.value || typeof c.value !== 'string') continue;

    const column = FIELD_MAP[c.field as keyof typeof FIELD_MAP];
    if (!column) continue;

    switch (c.operator) {
      case 'equals':
        conds.push(eq(column, c.value));
        break;
      case 'not_equals':
        // distinct-from handles NULLs cleanly (regular `<>` treats NULL as unknown).
        conds.push(sql`${column} IS DISTINCT FROM ${c.value}`);
        break;
      case 'contains':
        conds.push(like(column, `%${escapeLike(c.value)}%`));
        break;
      case 'not_contains':
        conds.push(
          or(
            sql`${column} IS NULL`,
            notLike(column, `%${escapeLike(c.value)}%`)
          )!
        );
        break;
    }
  }

  if (conds.length === 0) return undefined;
  if (conds.length === 1) return conds[0];
  return filters.logic === 'or' ? or(...conds) : and(...conds);
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, c => '\\' + c);
}
