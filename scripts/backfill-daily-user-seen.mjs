// Backfill daily_user_seen from existing events. Idempotent (ON CONFLICT DO NOTHING).
// Run with: node --env-file=.env.local scripts/backfill-daily-user-seen.mjs

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

console.log('Backfilling daily_user_seen from events...');
const result = await sql.query(`
  INSERT INTO daily_user_seen (project_id, date, distinct_id, first_seen_at)
  SELECT
    project_id,
    date_trunc('day', timestamp)::date AS date,
    distinct_id,
    MIN(timestamp) AS first_seen_at
  FROM events
  WHERE distinct_id IS NOT NULL
  GROUP BY project_id, date_trunc('day', timestamp)::date, distinct_id
  ON CONFLICT DO NOTHING
  RETURNING project_id
`);

console.log(`Inserted ${result.length} new (project, day, user) rows.`);

const total = await sql.query(`SELECT COUNT(*) AS c FROM daily_user_seen`);
console.log(`daily_user_seen now contains ${total[0].c} rows total.`);
