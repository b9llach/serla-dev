import { db, webhooks, webhookDeliveries } from '@/lib/db';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { formatWebhookPayload, WebhookType, WebhookEvent } from './formatters';
import { decryptSecret } from '@/lib/utils/encryption';

// Circuit breaker config
const CIRCUIT_BREAKER_THRESHOLD = 10; // Disable webhook after N consecutive failures
const RESPONSE_BODY_MAX_LENGTH = 10000; // Bytes of response body to retain for debug

/**
 * Create HMAC signature for webhook payload
 */
async function createSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return 'sha256=' + Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Trigger webhooks for an event
 * This queues webhook deliveries - actual sending happens via cron or immediately
 */
export async function triggerWebhooks(
  projectId: string,
  event: WebhookEvent
): Promise<void> {
  try {
    console.log(`[Webhooks] Triggering for project ${projectId}, event: ${event.name}`);

    // Get all enabled webhooks for this project (excluding circuit-broken ones)
    const projectWebhooks = await db.query.webhooks.findMany({
      where: and(
        eq(webhooks.projectId, projectId),
        eq(webhooks.enabled, true),
        isNull(webhooks.disabledAt)
      ),
    });

    console.log(`[Webhooks] Found ${projectWebhooks.length} enabled webhooks for project`);

    if (projectWebhooks.length === 0) {
      return;
    }

    // Filter webhooks by event name filter
    const matchingWebhooks = projectWebhooks.filter(webhook => {
      const eventFilters = webhook.events as string[];
      // If no filters, match all events
      if (!eventFilters || eventFilters.length === 0) {
        console.log(`[Webhooks] Webhook ${webhook.id} (${webhook.name}) matches all events`);
        return true;
      }
      // Check if event name matches any filter
      const matches = eventFilters.some(filter =>
        event.name.toLowerCase().includes(filter.toLowerCase()) ||
        filter.toLowerCase() === event.name.toLowerCase()
      );
      console.log(`[Webhooks] Webhook ${webhook.id} filters: ${JSON.stringify(eventFilters)}, matches: ${matches}`);
      return matches;
    });

    console.log(`[Webhooks] ${matchingWebhooks.length} webhooks match event "${event.name}"`);

    // Send webhooks (fire and forget for low latency)
    for (const webhook of matchingWebhooks) {
      // Don't await - send asynchronously
      sendWebhook(webhook, event).catch(err => {
        console.error(`[Webhooks] Delivery error for ${webhook.id}:`, err);
      });
    }
  } catch (error) {
    console.error('[Webhooks] Error triggering webhooks:', error);
  }
}

/**
 * Send a webhook immediately
 */
async function sendWebhook(
  webhook: typeof webhooks.$inferSelect,
  event: WebhookEvent
): Promise<void> {
  console.log(`[Webhooks] Sending to ${webhook.name} (${webhook.type}) - URL: ${webhook.url.substring(0, 50)}...`);

  const webhookType = (webhook.type || 'raw') as WebhookType;

  // Format payload based on webhook type
  const { body, contentType } = formatWebhookPayload(webhookType, event);

  console.log(`[Webhooks] Payload formatted for ${webhookType}, body length: ${body.length}`);

  // Create signature for raw webhooks (Discord/Slack have their own auth).
  // Secret is encrypted at rest; decrypt only at signing time.
  const signature = webhookType === 'raw'
    ? await createSignature(body, decryptSecret(webhook.secret))
    : '';

  // Create delivery record first (for tracking)
  const [delivery] = await db.insert(webhookDeliveries).values({
    webhookId: webhook.id,
    eventId: event.id,
    status: 'pending',
    attempts: 0,
  }).returning({ id: webhookDeliveries.id });

  console.log(`[Webhooks] Created delivery record: ${delivery.id}`);

  try {
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': contentType,
    };

    // Only add signature header for raw webhooks
    if (webhookType === 'raw') {
      headers['X-Serla-Signature'] = signature;
      headers['X-Serla-Delivery-Id'] = delivery.id;
      headers['X-Serla-Event'] = event.name;
    }

    // Send the webhook
    console.log(`[Webhooks] Sending POST to ${webhook.url}`);
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    console.log(`[Webhooks] Response status: ${response.status}`);

    if (response.ok) {
      // Success: reset circuit breaker
      await db.update(webhookDeliveries)
        .set({
          status: 'success',
          statusCode: response.status,
          attempts: 1,
          lastAttemptAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id));

      await db.update(webhooks)
        .set({
          consecutiveFailures: 0,
          lastSuccessAt: new Date(),
        })
        .where(eq(webhooks.id, webhook.id));

      console.log(`[Webhooks] Delivery successful for ${webhook.name}`);
    } else {
      // HTTP error - record and trip the circuit breaker if threshold hit.
      const fullBody = await response.text().catch(() => '');
      const truncated = fullBody.length > RESPONSE_BODY_MAX_LENGTH;
      const responseBody = truncated
        ? fullBody.substring(0, RESPONSE_BODY_MAX_LENGTH) + `\n[truncated, original ${fullBody.length} bytes]`
        : fullBody;
      console.log(`[Webhooks] Delivery failed with status ${response.status}: ${responseBody.substring(0, 200)}`);
      await db.update(webhookDeliveries)
        .set({
          status: 'failed',
          statusCode: response.status,
          responseBody,
          attempts: 1,
          lastAttemptAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id));

      await recordWebhookFailure(webhook.id);
    }
  } catch (error) {
    // Network error - will retry via cron
    console.error(`[Webhooks] Network error for ${webhook.name}:`, error);
    await db.update(webhookDeliveries)
      .set({
        status: 'failed',
        responseBody: error instanceof Error ? error.message : 'Network error',
        attempts: 1,
        lastAttemptAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, delivery.id));

    await recordWebhookFailure(webhook.id);
  }
}

/**
 * Increment consecutive_failures and disable webhook if threshold exceeded.
 * Single atomic UPDATE - no race between increment and threshold check.
 */
async function recordWebhookFailure(webhookId: string): Promise<void> {
  await db.update(webhooks)
    .set({
      consecutiveFailures: sql`${webhooks.consecutiveFailures} + 1`,
      disabledAt: sql`
        CASE
          WHEN ${webhooks.consecutiveFailures} + 1 >= ${CIRCUIT_BREAKER_THRESHOLD}
          THEN now()
          ELSE ${webhooks.disabledAt}
        END
      `,
    })
    .where(eq(webhooks.id, webhookId));
}
