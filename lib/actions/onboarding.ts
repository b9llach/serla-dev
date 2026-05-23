'use server';

import { db, events, dailyUserSeen, users } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';

const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'CA', 'AU', 'JP', 'BR', 'IN', 'NL'];
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge'];
const DEVICE_TYPES: Array<'desktop' | 'mobile' | 'tablet'> = ['desktop', 'mobile', 'tablet'];
const PAGES = ['/', '/pricing', '/docs', '/blog', '/about', '/signup', '/login', '/dashboard'];
const UTM_SOURCES = ['google', 'twitter', 'producthunt', 'hackernews', null, null, null]; // null = organic
const EVENT_NAMES = ['$pageview', '$pageview', '$pageview', '$autoclick', 'signup', 'button_clicked', 'feature_used'];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomHex(bytes: number): string {
  let out = '';
  for (let i = 0; i < bytes; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  return out;
}

/**
 * Mark the onboarding wizard as dismissed for the signed-in user. From now on
 * the dashboard home will render the normal zero-event panel instead of the
 * wizard when their project has no events.
 */
export async function dismissOnboarding(): Promise<{ success: boolean }> {
  const session = await getSession();
  if (!session) return { success: false };

  await db.update(users)
    .set({ onboardingDismissedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, session.userId));

  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * Generate ~500 realistic-looking events spread across the past 30 days for
 * the given project. Every event is tagged properties.isSample=true so it can
 * be cleanly removed via clearSampleData.
 *
 * Owner or editor only.
 */
export async function generateSampleData(projectId: string): Promise<{ success: boolean; count?: number; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) return { success: false, error: 'Project not found' };

  // Build ~30 fake users with stable distinct_ids.
  const USERS = Array.from({ length: 30 }, () => `sample_user_${randomHex(6)}`);

  const TOTAL = 500;
  const now = Date.now();
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const rows: (typeof events.$inferInsert)[] = [];
  const seenRows: Array<{ projectId: string; date: string; distinctId: string }> = [];
  const seenKey = new Set<string>();

  for (let i = 0; i < TOTAL; i++) {
    const distinctId = pick(USERS);
    const timestamp = new Date(monthAgo + Math.random() * (now - monthAgo));
    const eventName = pick(EVENT_NAMES);
    const pagePath = pick(PAGES);
    const country = pick(COUNTRIES);
    const browser = pick(BROWSERS);
    const deviceType = pick(DEVICE_TYPES);
    const utmSource = pick(UTM_SOURCES);

    const properties: Record<string, unknown> = { isSample: true };
    if (eventName === 'signup') properties.plan = pick(['free', 'pro', 'max']);
    if (eventName === 'feature_used') properties.feature = pick(['export', 'webhook', 'funnel', 'alert']);

    rows.push({
      projectId,
      distinctId,
      sessionId: `sample_session_${distinctId}_${Math.floor(timestamp.getTime() / (4 * 60 * 60 * 1000))}`,
      name: eventName,
      properties,
      timestamp,
      pageUrl: `https://example.com${pagePath}`,
      pagePath,
      pageTitle: pagePath === '/' ? 'Home' : pagePath.slice(1).replace(/^./, c => c.toUpperCase()),
      country,
      browser,
      deviceType,
      utmSource: utmSource ?? undefined,
    });

    // daily_user_seen counter mirroring real ingestion.
    const dateStr = timestamp.toISOString().slice(0, 10);
    const key = `${dateStr}:${distinctId}`;
    if (!seenKey.has(key)) {
      seenKey.add(key);
      seenRows.push({ projectId, date: dateStr, distinctId });
    }
  }

  // Insert in batches because the Neon driver caps payload size.
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(events).values(rows.slice(i, i + BATCH));
    inserted += Math.min(BATCH, rows.length - i);
  }
  if (seenRows.length > 0) {
    for (let i = 0; i < seenRows.length; i += BATCH) {
      await db.insert(dailyUserSeen)
        .values(seenRows.slice(i, i + BATCH))
        .onConflictDoNothing();
    }
  }

  revalidatePath('/dashboard');
  return { success: true, count: inserted };
}

/**
 * Delete every event tagged properties.isSample=true for this project.
 * Editor+ only. Also prunes daily_user_seen rows that no longer have any
 * real events.
 */
export async function clearSampleData(projectId: string): Promise<{ success: boolean; count?: number; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) return { success: false, error: 'Project not found' };

  const deleted = await db
    .delete(events)
    .where(and(
      eq(events.projectId, projectId),
      sql`(${events.properties}->>'isSample') = 'true'`,
    ))
    .returning({ id: events.id });

  // Drop daily_user_seen rows for sample users that no longer have any events.
  await db.execute(sql`
    DELETE FROM daily_user_seen
    WHERE project_id = ${projectId}
      AND distinct_id LIKE 'sample_user_%'
      AND NOT EXISTS (
        SELECT 1 FROM events
        WHERE events.project_id = daily_user_seen.project_id
          AND events.distinct_id = daily_user_seen.distinct_id
      )
  `);

  revalidatePath('/dashboard');
  return { success: true, count: deleted.length };
}
