'use server';

import { db, alerts, webhooks } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

const ALLOWED_METRICS = ['events', 'users', 'sessions', 'event_count'] as const;
const ALLOWED_COMPARATORS = ['gt', 'lt'] as const;
const ALLOWED_WINDOWS = ['24h', '7d'] as const;

export async function createAlert(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const projectId = formData.get('projectId') as string;
  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) return { success: false, error: 'Project not found' };

  const name = (formData.get('name') as string)?.trim();
  const metric = formData.get('metric') as string;
  const eventName = (formData.get('eventName') as string)?.trim() || null;
  const comparator = formData.get('comparator') as string;
  const thresholdRaw = formData.get('threshold') as string;
  const windowSize = formData.get('windowSize') as string;
  const notifyEmail = (formData.get('notifyEmail') as string)?.trim() || null;
  const webhookIdRaw = (formData.get('webhookId') as string)?.trim();
  const webhookId = webhookIdRaw && webhookIdRaw !== '' ? webhookIdRaw : null;

  if (!name) return { success: false, error: 'Name is required' };
  if (!ALLOWED_METRICS.includes(metric as (typeof ALLOWED_METRICS)[number])) {
    return { success: false, error: 'Invalid metric' };
  }
  if (!ALLOWED_COMPARATORS.includes(comparator as (typeof ALLOWED_COMPARATORS)[number])) {
    return { success: false, error: 'Invalid comparator' };
  }
  if (!ALLOWED_WINDOWS.includes(windowSize as (typeof ALLOWED_WINDOWS)[number])) {
    return { success: false, error: 'Invalid window' };
  }
  const threshold = Number(thresholdRaw);
  if (!Number.isFinite(threshold) || threshold < 0) {
    return { success: false, error: 'Threshold must be a non-negative number' };
  }
  if (metric === 'event_count' && !eventName) {
    return { success: false, error: 'event_count metric requires an event name' };
  }
  if (!notifyEmail && !webhookId) {
    return { success: false, error: 'At least one delivery channel (email or webhook) is required' };
  }

  // Verify webhook belongs to the same project if provided.
  if (webhookId) {
    const wh = await db.query.webhooks.findFirst({ where: eq(webhooks.id, webhookId) });
    if (!wh || wh.projectId !== projectId) {
      return { success: false, error: 'Webhook not found in this project' };
    }
  }

  await db.insert(alerts).values({
    projectId,
    name,
    metric,
    eventName,
    comparator,
    threshold: threshold.toString(),
    windowSize,
    notifyEmail,
    webhookId,
  });

  revalidatePath('/dashboard/alerts');
  return { success: true };
}

export async function deleteAlert(alertId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const alert = await db.query.alerts.findFirst({ where: eq(alerts.id, alertId) });
  if (!alert) throw new Error('Alert not found');
  const role = await requireRole(session.userId, alert.projectId, 'editor');
  if (!role) throw new Error('Alert not found');

  await db.delete(alerts).where(eq(alerts.id, alertId));
  revalidatePath('/dashboard/alerts');
}

export async function toggleAlert(alertId: string, enabled: boolean): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const alert = await db.query.alerts.findFirst({ where: eq(alerts.id, alertId) });
  if (!alert) throw new Error('Alert not found');
  const role = await requireRole(session.userId, alert.projectId, 'editor');
  if (!role) throw new Error('Alert not found');

  await db.update(alerts)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(alerts.id, alertId));
  revalidatePath('/dashboard/alerts');
}
