'use server';

import { db, webhooks, webhookDeliveries, projects, events } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { revalidatePath } from 'next/cache';
import { and, eq, desc, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { encryptSecret } from '@/lib/utils/encryption';
import { formatWebhookPayload, WebhookType, WebhookEvent } from '@/lib/webhooks/formatters';

// Private IP ranges that should be blocked for SSRF protection
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // Loopback
  /^10\./,                           // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // Private Class B
  /^192\.168\./,                     // Private Class C
  /^169\.254\./,                     // Link-local
  /^0\./,                            // Current network
  /^::1$/,                           // IPv6 loopback
  /^fc/i,                            // IPv6 unique local
  /^fe80/i,                          // IPv6 link-local
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  '*.local',
  '*.internal',
  'metadata.google.internal',      // GCP metadata
  '169.254.169.254',               // Cloud metadata endpoint
];

function isPrivateOrReservedIP(hostname: string): boolean {
  // Check against private IP patterns
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();

  for (const blocked of BLOCKED_HOSTNAMES) {
    if (blocked.startsWith('*.')) {
      const suffix = blocked.slice(1);
      if (lowerHostname.endsWith(suffix) || lowerHostname === suffix.slice(1)) {
        return true;
      }
    } else if (lowerHostname === blocked) {
      return true;
    }
  }
  return false;
}

function validateWebhookUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Require HTTPS for production webhooks
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Webhook URL must use HTTPS' };
    }

    // Check for blocked hostnames
    if (isBlockedHostname(parsed.hostname)) {
      return { valid: false, error: 'Webhook URL cannot point to private or internal addresses' };
    }

    // Check for private IPs
    if (isPrivateOrReservedIP(parsed.hostname)) {
      return { valid: false, error: 'Webhook URL cannot point to private IP addresses' };
    }

    // Block common metadata endpoints
    if (parsed.hostname === '169.254.169.254') {
      return { valid: false, error: 'Webhook URL cannot point to cloud metadata endpoints' };
    }

    // Validate port (only standard HTTPS port)
    if (parsed.port && parsed.port !== '443') {
      return { valid: false, error: 'Webhook URL must use standard HTTPS port (443)' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export async function createWebhook(formData: FormData): Promise<{ success: boolean; error?: string; secret?: string }> {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const projectId = formData.get('projectId') as string;
  const name = (formData.get('name') as string) || 'Webhook';
  const type = (formData.get('type') as string) || 'raw';
  const url = formData.get('url') as string;
  const eventsStr = formData.get('events') as string;
  const events = eventsStr
    ? eventsStr.split(',').map(e => e.trim()).filter(Boolean)
    : [];

  // Verify the caller has editor access to the project
  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) {
    return { success: false, error: 'Project not found' };
  }

  // Validate webhook URL for SSRF protection
  const urlValidation = validateWebhookUrl(url);
  if (!urlValidation.valid) {
    return { success: false, error: urlValidation.error };
  }

  // Generate the HMAC signing key. We return the plaintext to the user ONCE
  // (so they can configure verification), but store only the encrypted form.
  const secret = randomBytes(32).toString('hex');

  await db.insert(webhooks).values({
    projectId,
    name,
    type,
    url,
    events,
    secret: encryptSecret(secret),
    enabled: true,
  });

  revalidatePath('/dashboard/webhooks');

  // Plaintext secret returned to user this one time.
  return { success: true, secret };
}

export async function deleteWebhook(webhookId: string) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  // Verify ownership: webhook -> project -> editor role
  const webhook = await db.query.webhooks.findFirst({
    where: eq(webhooks.id, webhookId),
  });
  if (!webhook) {
    throw new Error('Webhook not found');
  }
  const role = await requireRole(session.userId, webhook.projectId, 'editor');
  if (!role) {
    throw new Error('Webhook not found');
  }

  await db.delete(webhooks).where(eq(webhooks.id, webhookId));
  revalidatePath('/dashboard/webhooks');
}

export async function toggleWebhook(webhookId: string, enabled: boolean) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  // Verify editor access to the project
  const webhook = await db.query.webhooks.findFirst({
    where: eq(webhooks.id, webhookId),
  });
  if (!webhook) {
    throw new Error('Webhook not found');
  }
  const role = await requireRole(session.userId, webhook.projectId, 'editor');
  if (!role) {
    throw new Error('Webhook not found');
  }

  // Re-enabling also clears the circuit-breaker state so the next failure
  // starts the counter from zero (otherwise the webhook would auto-disable
  // again after a single new failure since the counter was at the threshold).
  await db.update(webhooks)
    .set(
      enabled
        ? { enabled: true, disabledAt: null, consecutiveFailures: 0 }
        : { enabled: false }
    )
    .where(eq(webhooks.id, webhookId));

  revalidatePath('/dashboard/webhooks');
}

/**
 * Send a synthetic test event to a webhook URL without persisting anything.
 * Returns status code + truncated response body so the user can see whether
 * their endpoint is reachable and accepts the payload format.
 */
export async function testWebhookUrl(
  url: string,
  type: string,
  projectId: string
): Promise<{ ok: boolean; statusCode?: number; responseBody?: string; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized' };
  }

  // Require editor access on the project to use this outbound-request tool.
  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) {
    return { ok: false, error: 'Project not found' };
  }

  // Same SSRF guard as createWebhook.
  const urlValidation = validateWebhookUrl(url);
  if (!urlValidation.valid) {
    return { ok: false, error: urlValidation.error };
  }

  const webhookType = (type || 'raw') as WebhookType;
  const sampleEvent: WebhookEvent = {
    id: 'test-' + randomBytes(8).toString('hex'),
    name: 'serla.webhook.test',
    distinctId: 'test-user',
    timestamp: new Date().toISOString(),
    properties: { test: true, source: 'webhook-test-button' },
    country: 'US',
    browser: 'Chrome',
    device: 'desktop',
    pageUrl: 'https://example.com/test',
  };

  const { body, contentType } = formatWebhookPayload(webhookType, sampleEvent);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-Serla-Test': 'true',
        'X-Serla-Event': sampleEvent.name,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text().catch(() => '');
    return {
      ok: response.ok,
      statusCode: response.status,
      responseBody: text.slice(0, 500),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Request failed',
    };
  }
}

/**
 * Return the list of distinct event names a project has received, ordered by
 * recent volume. Used to populate the webhook event-filter multiselect.
 */
export async function getProjectEventNames(projectId: string): Promise<string[]> {
  const session = await getSession();
  if (!session) return [];

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, session.userId)),
  });
  if (!project) return [];

  const rows = await db
    .select({ name: events.name, count: sql<number>`count(*)` })
    .from(events)
    .where(eq(events.projectId, projectId))
    .groupBy(events.name)
    .orderBy(desc(sql`count(*)`))
    .limit(50);

  return rows.map(r => r.name);
}

/**
 * Re-queue a failed delivery for the next retry-cron pass. We don't try to
 * deliver synchronously here - that would block the user's click and could
 * timeout. Instead we reset status to 'pending' and zero the lastAttemptAt
 * so the cron picks it up immediately.
 */
export async function retryWebhookDelivery(deliveryId: string): Promise<void> {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  // Ownership: delivery -> webhook -> project -> editor role
  const delivery = await db.query.webhookDeliveries.findFirst({
    where: eq(webhookDeliveries.id, deliveryId),
  });
  if (!delivery) {
    throw new Error('Delivery not found');
  }
  const webhook = await db.query.webhooks.findFirst({
    where: eq(webhooks.id, delivery.webhookId),
  });
  if (!webhook) {
    throw new Error('Delivery not found');
  }
  const role = await requireRole(session.userId, webhook.projectId, 'editor');
  if (!role) {
    throw new Error('Delivery not found');
  }

  await db
    .update(webhookDeliveries)
    .set({ status: 'pending', lastAttemptAt: null })
    .where(eq(webhookDeliveries.id, deliveryId));

  revalidatePath(`/dashboard/webhooks/${delivery.webhookId}`);
}
