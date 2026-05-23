import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

/**
 * Try to acquire a named cron lock. Returns true if acquired, false if another
 * instance already holds it (and the lock hasn't expired).
 *
 * The lock is held for `ttlSeconds` (default 15 minutes). If the cron crashes
 * without releasing, the lock auto-expires.
 *
 * Pattern:
 *   const acquired = await acquireCronLock('daily', 900);
 *   if (!acquired) return NextResponse.json({ skipped: 'already running' });
 *   try { ... } finally { await releaseCronLock('daily'); }
 */
export async function acquireCronLock(name: string, ttlSeconds: number = 900): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO cron_locks (name, locked_at, expires_at)
    VALUES (${name}, now(), now() + (${ttlSeconds} || ' seconds')::interval)
    ON CONFLICT (name) DO UPDATE SET
      locked_at = EXCLUDED.locked_at,
      expires_at = EXCLUDED.expires_at
    WHERE cron_locks.expires_at < now()
    RETURNING name
  `);

  // Drizzle's neon-http db.execute returns an array of rows directly.
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows || [];
  return rows.length > 0;
}

export async function releaseCronLock(name: string): Promise<void> {
  await db.execute(sql`DELETE FROM cron_locks WHERE name = ${name}`);
}
