import { db, alerts, alertDeliveries, events, sessions, dailyUserSeen, webhooks } from '@/lib/db';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { decryptSecret } from '@/lib/utils/encryption';
import { sendEmail } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface AlertRow {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  metric: string;
  eventName: string | null;
  comparator: string;
  threshold: string;
  windowSize: string;
  cooldownHours: number;
  notifyEmail: string | null;
  webhookId: string | null;
  lastTriggeredAt: Date | null;
}

/**
 * Compute the observed metric value for an alert over its window.
 */
async function computeMetric(alert: AlertRow, windowStart: Date, windowEnd: Date): Promise<number> {
  switch (alert.metric) {
    case 'events': {
      const r = await db
        .select({ count: sql<number>`count(*)` })
        .from(events)
        .where(and(
          eq(events.projectId, alert.projectId),
          gte(events.timestamp, windowStart),
          lt(events.timestamp, windowEnd),
        ));
      return Number(r[0]?.count ?? 0);
    }
    case 'users': {
      // Use the pre-aggregated daily_user_seen table for performance.
      // Counts distinct (date, distinctId) tuples within the window. For 24h
      // this approximates "unique users today"; for 7d it sums daily uniques
      // which over-counts users active multiple days. Accept the tradeoff -
      // exact across-day distinct count would require a full table scan.
      const startDate = windowStart.toISOString().slice(0, 10);
      const endDate = windowEnd.toISOString().slice(0, 10);
      const r = await db
        .select({ count: sql<number>`count(*)` })
        .from(dailyUserSeen)
        .where(and(
          eq(dailyUserSeen.projectId, alert.projectId),
          gte(dailyUserSeen.date, startDate),
          lt(dailyUserSeen.date, endDate),
        ));
      return Number(r[0]?.count ?? 0);
    }
    case 'sessions': {
      const r = await db
        .select({ count: sql<number>`count(*)` })
        .from(sessions)
        .where(and(
          eq(sessions.projectId, alert.projectId),
          gte(sessions.startedAt, windowStart),
          lt(sessions.startedAt, windowEnd),
        ));
      return Number(r[0]?.count ?? 0);
    }
    case 'event_count': {
      if (!alert.eventName) return 0;
      const r = await db
        .select({ count: sql<number>`count(*)` })
        .from(events)
        .where(and(
          eq(events.projectId, alert.projectId),
          eq(events.name, alert.eventName),
          gte(events.timestamp, windowStart),
          lt(events.timestamp, windowEnd),
        ));
      return Number(r[0]?.count ?? 0);
    }
    default:
      return 0;
  }
}

function thresholdCrossed(observed: number, threshold: number, comparator: string): boolean {
  if (comparator === 'gt') return observed > threshold;
  if (comparator === 'lt') return observed < threshold;
  return false;
}

function windowMs(window: string): number {
  if (window === '7d') return 7 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function metricLabel(metric: string, eventName: string | null): string {
  if (metric === 'events') return 'Events';
  if (metric === 'users') return 'Unique users';
  if (metric === 'sessions') return 'Sessions';
  if (metric === 'event_count' && eventName) return `${eventName} count`;
  return metric;
}

async function fireWebhook(webhookId: string, alert: AlertRow, observed: number, threshold: number): Promise<string | null> {
  const wh = await db.query.webhooks.findFirst({ where: eq(webhooks.id, webhookId) });
  if (!wh || !wh.enabled || wh.disabledAt) {
    return 'Webhook not active';
  }
  const payload = {
    type: 'alert.triggered',
    alert: {
      id: alert.id,
      name: alert.name,
      metric: alert.metric,
      eventName: alert.eventName,
      comparator: alert.comparator,
      threshold,
      observedValue: observed,
      window: alert.windowSize,
    },
    timestamp: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);
  try {
    const signature = await createSignature(body, decryptSecret(wh.secret));
    const res = await fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Serla-Event': 'alert.triggered',
        'X-Serla-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `Webhook HTTP ${res.status}`;
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Webhook request failed';
  }
}

async function fireEmail(toAddress: string, alert: AlertRow, observed: number, threshold: number): Promise<string | null> {
  const label = metricLabel(alert.metric, alert.eventName);
  const direction = alert.comparator === 'gt' ? 'above' : 'below';
  const subject = `[Serla] Alert: ${alert.name} ${direction} threshold`;
  const detailLine = `${label} in the last ${alert.windowSize}: ${observed.toLocaleString()} (threshold: ${threshold.toLocaleString()})`;
  const alertUrl = `${APP_URL}/dashboard/alerts`;
  const text = `Your Serla alert "${alert.name}" triggered.\n\n${detailLine}\n\nView and edit: ${alertUrl}`;
  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px;">Alert triggered: ${escapeHtml(alert.name)}</h2>
      <p style="color: #555;">${escapeHtml(detailLine)}</p>
      <p><a href="${alertUrl}" style="color: #2563eb;">View alert →</a></p>
    </div>
  `;
  const ok = await sendEmail({ to: toAddress, subject, text, html });
  return ok ? null : 'Email send failed';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function createSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return 'sha256=' + Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Evaluate every enabled alert. For each one:
 * 1. Compute the observed metric over its window.
 * 2. Check if the threshold is crossed AND we're past the cooldown.
 * 3. If yes, deliver via the configured channels and log an alert_deliveries row.
 */
export async function evaluateAlerts(now: Date = new Date()): Promise<{ evaluated: number; fired: number }> {
  const enabledAlerts = await db.query.alerts.findMany({
    where: eq(alerts.enabled, true),
  });

  let fired = 0;

  for (const a of enabledAlerts) {
    const windowStart = new Date(now.getTime() - windowMs(a.windowSize));
    const observed = await computeMetric(a as AlertRow, windowStart, now);
    const thresholdNum = Number(a.threshold);
    const crossed = thresholdCrossed(observed, thresholdNum, a.comparator);

    // Always update lastEvaluatedAt regardless of outcome.
    await db.update(alerts)
      .set({ lastEvaluatedAt: now })
      .where(eq(alerts.id, a.id));

    if (!crossed) continue;

    // Respect cooldown window so we don't spam the user every cron run.
    if (a.lastTriggeredAt) {
      const cooldownMs = a.cooldownHours * 60 * 60 * 1000;
      if (now.getTime() - a.lastTriggeredAt.getTime() < cooldownMs) {
        continue;
      }
    }

    // Deliver - any failure is logged but doesn't abort the cron pass.
    const errors: string[] = [];
    if (a.notifyEmail) {
      const err = await fireEmail(a.notifyEmail, a as AlertRow, observed, thresholdNum);
      if (err) errors.push(`email: ${err}`);
    }
    if (a.webhookId) {
      const err = await fireWebhook(a.webhookId, a as AlertRow, observed, thresholdNum);
      if (err) errors.push(`webhook: ${err}`);
    }

    const status =
      errors.length === 0 ? 'success' :
      errors.length < (a.notifyEmail ? 1 : 0) + (a.webhookId ? 1 : 0) ? 'partial' :
      'failed';

    await db.insert(alertDeliveries).values({
      alertId: a.id,
      observedValue: observed.toString(),
      thresholdAtFire: thresholdNum.toString(),
      deliveryStatus: status,
      deliveryError: errors.length > 0 ? errors.join('; ') : null,
    });

    // Only update lastTriggeredAt on successful or partial delivery so a
    // total-fail doesn't enter the cooldown window.
    if (status !== 'failed') {
      await db.update(alerts)
        .set({ lastTriggeredAt: now })
        .where(eq(alerts.id, a.id));
    }

    fired++;
  }

  return { evaluated: enabledAlerts.length, fired };
}
