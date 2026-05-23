import { NextRequest, NextResponse } from 'next/server';
import { db, webhooks, webhookDeliveries } from '@/lib/db';
import { and, eq, lt, sql } from 'drizzle-orm';
import { validateCronSecret } from '@/lib/utils/crypto';
import { acquireCronLock, releaseCronLock } from '@/lib/utils/cron-lock';
import { decryptSecret } from '@/lib/utils/encryption';

// Vercel Cron: Run every 5 minutes
// Add to vercel.json: { "crons": [{ "path": "/api/cron/webhooks", "schedule": "*/5 * * * *" }] }

const MAX_RETRIES = 3;
const RETRY_DELAYS = [60000, 300000, 900000]; // 1 min, 5 min, 15 min
const WEBHOOK_TIMEOUT_MS = 10000; // 10 second timeout for webhook requests
const RESPONSE_BODY_MAX_LENGTH = 10000;
const CIRCUIT_BREAKER_THRESHOLD = 10;

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (!validateCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockAcquired = await acquireCronLock('webhooks', 3000);
  if (!lockAcquired) {
    return NextResponse.json({ skipped: 'already running' });
  }

  try {
    console.log('Processing webhook retries...');

    // Get pending or failed deliveries that haven't exceeded max retries
    const pendingDeliveries = await db.query.webhookDeliveries.findMany({
      where: and(
        eq(webhookDeliveries.status, 'pending'),
        lt(webhookDeliveries.attempts, MAX_RETRIES)
      ),
      with: {
        webhook: true,
      },
      limit: 100,
    });

    // Get failed deliveries ready for retry
    const failedDeliveries = await db.query.webhookDeliveries.findMany({
      where: and(
        eq(webhookDeliveries.status, 'failed'),
        lt(webhookDeliveries.attempts, MAX_RETRIES)
      ),
      with: {
        webhook: true,
      },
      limit: 100,
    });

    const allDeliveries = [...pendingDeliveries, ...failedDeliveries];

    let successCount = 0;
    let failCount = 0;

    for (const delivery of allDeliveries) {
      if (!delivery.webhook || !delivery.webhook.enabled || delivery.webhook.disabledAt) {
        continue;
      }

      // Check if enough time has passed since last attempt
      if (delivery.lastAttemptAt) {
        const retryDelay = RETRY_DELAYS[delivery.attempts] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        const nextRetryTime = new Date(delivery.lastAttemptAt.getTime() + retryDelay);
        if (new Date() < nextRetryTime) {
          continue;
        }
      }

      // Atomic claim: update lastAttemptAt BEFORE sending so any overlapping
      // cron invocation that fetches this same row will see the fresh timestamp
      // and skip via the retry-delay check above.
      const claimed = await db.update(webhookDeliveries)
        .set({ lastAttemptAt: new Date() })
        .where(and(
          eq(webhookDeliveries.id, delivery.id),
          // Only claim if lastAttemptAt is what we read - prevents two crons
          // both claiming the same record.
          delivery.lastAttemptAt
            ? eq(webhookDeliveries.lastAttemptAt, delivery.lastAttemptAt)
            : sql`${webhookDeliveries.lastAttemptAt} IS NULL`
        ))
        .returning({ id: webhookDeliveries.id });
      if (claimed.length === 0) {
        // Another worker claimed this delivery between our fetch and update.
        continue;
      }

      try {
        // Build webhook payload
        const payload = {
          deliveryId: delivery.id,
          eventId: delivery.eventId,
          timestamp: new Date().toISOString(),
        };

        // Create signature
        const signature = await createSignature(JSON.stringify(payload), decryptSecret(delivery.webhook.secret));

        // Send webhook with timeout
        const response = await fetch(delivery.webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Serla-Signature': signature,
            'X-Serla-Delivery-Id': delivery.id,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        });

        if (response.ok) {
          await db.update(webhookDeliveries)
            .set({
              status: 'success',
              statusCode: response.status,
              attempts: delivery.attempts + 1,
              lastAttemptAt: new Date(),
            })
            .where(eq(webhookDeliveries.id, delivery.id));

          await db.update(webhooks)
            .set({ consecutiveFailures: 0, lastSuccessAt: new Date() })
            .where(eq(webhooks.id, delivery.webhookId));

          successCount++;
        } else {
          const fullBody = await response.text().catch(() => '');
          const truncated = fullBody.length > RESPONSE_BODY_MAX_LENGTH;
          const responseBody = truncated
            ? fullBody.substring(0, RESPONSE_BODY_MAX_LENGTH) + `\n[truncated, original ${fullBody.length} bytes]`
            : fullBody;
          await db.update(webhookDeliveries)
            .set({
              status: delivery.attempts + 1 >= MAX_RETRIES ? 'failed' : 'pending',
              statusCode: response.status,
              responseBody,
              attempts: delivery.attempts + 1,
              lastAttemptAt: new Date(),
            })
            .where(eq(webhookDeliveries.id, delivery.id));

          await db.update(webhooks)
            .set({
              consecutiveFailures: sql`${webhooks.consecutiveFailures} + 1`,
              disabledAt: sql`CASE WHEN ${webhooks.consecutiveFailures} + 1 >= ${CIRCUIT_BREAKER_THRESHOLD} THEN now() ELSE ${webhooks.disabledAt} END`,
            })
            .where(eq(webhooks.id, delivery.webhookId));

          failCount++;
        }
      } catch (error) {
        await db.update(webhookDeliveries)
          .set({
            status: delivery.attempts + 1 >= MAX_RETRIES ? 'failed' : 'pending',
            responseBody: error instanceof Error ? error.message : 'Unknown error',
            attempts: delivery.attempts + 1,
            lastAttemptAt: new Date(),
          })
          .where(eq(webhookDeliveries.id, delivery.id));

        await db.update(webhooks)
          .set({
            consecutiveFailures: sql`${webhooks.consecutiveFailures} + 1`,
            disabledAt: sql`CASE WHEN ${webhooks.consecutiveFailures} + 1 >= ${CIRCUIT_BREAKER_THRESHOLD} THEN now() ELSE ${webhooks.disabledAt} END`,
          })
          .where(eq(webhooks.id, delivery.webhookId));

        failCount++;
      }
    }

    console.log(`Webhook processing complete. Success: ${successCount}, Failed: ${failCount}`);

    return NextResponse.json({
      success: true,
      processed: allDeliveries.length,
      successCount,
      failCount,
    });
  } catch (error) {
    console.error('Webhook retry error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  } finally {
    await releaseCronLock('webhooks');
  }
}

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
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
