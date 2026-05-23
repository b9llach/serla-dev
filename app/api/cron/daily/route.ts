import { NextRequest, NextResponse } from 'next/server';
import { db, events, sessions, dailyMetrics, projects, users, webhooks, webhookDeliveries, passwordResetTokens, emailVerificationTokens, dailyUserSeen } from '@/lib/db';
import { lt, and, eq, gte, sql, or, isNotNull, isNull } from 'drizzle-orm';
import { validateCronSecret } from '@/lib/utils/crypto';
import { acquireCronLock, releaseCronLock } from '@/lib/utils/cron-lock';
import { decryptSecret } from '@/lib/utils/encryption';

// Combined daily cron job - runs at 2 AM UTC
// Handles: cleanup, aggregation, and webhook retries

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!validateCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Prevent double-execution if Vercel re-invokes a still-running cron.
  // Lock TTL is 50 minutes - longer than the cron should ever take but
  // shorter than the daily schedule.
  const lockAcquired = await acquireCronLock('daily', 3000);
  if (!lockAcquired) {
    return NextResponse.json({ skipped: 'already running' });
  }

  try {
    return await runDailyCron();
  } finally {
    await releaseCronLock('daily');
  }
}

async function runDailyCron() {

  const results = {
    cleanup: { success: false, eventsDeleted: 0, sessionsDeleted: 0, tokensDeleted: 0 },
    aggregate: { success: false, projectsProcessed: 0 },
    webhooks: { success: false, processed: 0, successCount: 0, failCount: 0 },
    alerts: { success: false, evaluated: 0, fired: 0 },
    digest: { success: false, sent: 0 },
  };

  // 1. CLEANUP - Delete old data based on retention settings
  try {
    console.log('Starting retention cleanup...');
    const allProjects = await db.query.projects.findMany({
      where: isNull(projects.deletedAt),
    });

    let totalEventsDeleted = 0;
    let totalSessionsDeleted = 0;

    for (const project of allProjects) {
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - project.retentionDays);

      const eventsResult = await db
        .delete(events)
        .where(
          and(
            eq(events.projectId, project.id),
            lt(events.timestamp, retentionDate)
          )
        )
        .returning({ id: events.id });

      const sessionsResult = await db
        .delete(sessions)
        .where(
          and(
            eq(sessions.projectId, project.id),
            lt(sessions.startedAt, retentionDate)
          )
        )
        .returning({ id: sessions.id });

      // Prune the unique-user counter for this project past retention.
      // date column is a date; compare as YYYY-MM-DD.
      const retentionDateStr = retentionDate.toISOString().slice(0, 10);
      await db
        .delete(dailyUserSeen)
        .where(
          and(
            eq(dailyUserSeen.projectId, project.id),
            lt(dailyUserSeen.date, retentionDateStr)
          )
        );

      totalEventsDeleted += eventsResult.length;
      totalSessionsDeleted += sessionsResult.length;
    }

    // Clean up expired/used tokens (older than 7 days)
    const tokenCleanupDate = new Date();
    tokenCleanupDate.setDate(tokenCleanupDate.getDate() - 7);

    const passwordTokensResult = await db
      .delete(passwordResetTokens)
      .where(
        or(
          lt(passwordResetTokens.expiresAt, tokenCleanupDate),
          and(
            isNotNull(passwordResetTokens.usedAt),
            lt(passwordResetTokens.usedAt, tokenCleanupDate)
          )
        )
      )
      .returning({ id: passwordResetTokens.id });

    const emailTokensResult = await db
      .delete(emailVerificationTokens)
      .where(
        or(
          lt(emailVerificationTokens.expiresAt, tokenCleanupDate),
          and(
            isNotNull(emailVerificationTokens.usedAt),
            lt(emailVerificationTokens.usedAt, tokenCleanupDate)
          )
        )
      )
      .returning({ id: emailVerificationTokens.id });

    const totalTokensDeleted = passwordTokensResult.length + emailTokensResult.length;

    // Hard-delete soft-deleted users and projects past 30-day grace period.
    // FK cascades take care of all child records (events, sessions, identities, etc).
    const softDeleteGrace = new Date();
    softDeleteGrace.setUTCDate(softDeleteGrace.getUTCDate() - 30);
    const hardDeletedProjects = await db
      .delete(projects)
      .where(and(isNotNull(projects.deletedAt), lt(projects.deletedAt, softDeleteGrace)))
      .returning({ id: projects.id });
    const hardDeletedUsers = await db
      .delete(users)
      .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, softDeleteGrace)))
      .returning({ id: users.id });
    if (hardDeletedProjects.length || hardDeletedUsers.length) {
      console.log(`Soft-delete sweep: hard-deleted ${hardDeletedProjects.length} projects, ${hardDeletedUsers.length} users past 30d grace`);
    }

    results.cleanup = {
      success: true,
      eventsDeleted: totalEventsDeleted,
      sessionsDeleted: totalSessionsDeleted,
      tokensDeleted: totalTokensDeleted,
    };
    console.log(`Cleanup complete: ${totalEventsDeleted} events, ${totalSessionsDeleted} sessions, ${totalTokensDeleted} tokens deleted`);
  } catch (error) {
    console.error('Cleanup error:', error);
  }

  // 2. AGGREGATE - Generate daily metrics for yesterday
  try {
    console.log('Starting daily metrics aggregation...');
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const allProjects = await db.query.projects.findMany({
      where: isNull(projects.deletedAt),
    });

    for (const project of allProjects) {
      const existing = await db.query.dailyMetrics.findFirst({
        where: and(
          eq(dailyMetrics.projectId, project.id),
          eq(dailyMetrics.date, yesterday)
        ),
      });

      // total + pageviews directly from events. uniqueUsers comes from the
      // pre-aggregated counter table which scales with unique users (cheap)
      // rather than total events (expensive).
      const eventStats = await db
        .select({
          total: sql<number>`count(*)`,
          pageviews: sql<number>`count(*) filter (where ${events.name} = '$pageview')`,
        })
        .from(events)
        .where(
          and(
            eq(events.projectId, project.id),
            gte(events.timestamp, yesterday),
            lt(events.timestamp, today)
          )
        );
      const yesterdayDateStr = yesterday.toISOString().slice(0, 10);
      const uniqueUsersResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(dailyUserSeen)
        .where(and(
          eq(dailyUserSeen.projectId, project.id),
          eq(dailyUserSeen.date, yesterdayDateStr)
        ));
      const uniqueUsersCount = Number(uniqueUsersResult[0]?.count || 0);

      const sessionStats = await db
        .select({
          total: sql<number>`count(*)`,
          avgDuration: sql<number>`avg(${sessions.duration})`,
          // Note: "bounce" here = any single-event session (not strictly single-pageview).
          // Custom events from the same session also count.
          bounceCount: sql<number>`count(*) filter (where ${sessions.eventCount} = 1)`,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.projectId, project.id),
            gte(sessions.startedAt, yesterday),
            lt(sessions.startedAt, today)
          )
        );

      const topSources = await db
        .select({
          source: sql<string>`COALESCE(${sessions.utmSource}, ${sessions.referrer}, 'direct')`,
          count: sql<number>`count(*)`,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.projectId, project.id),
            gte(sessions.startedAt, yesterday),
            lt(sessions.startedAt, today)
          )
        )
        .groupBy(sql`COALESCE(${sessions.utmSource}, ${sessions.referrer}, 'direct')`)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      const topPages = await db
        .select({
          page: events.pagePath,
          count: sql<number>`count(*)`,
        })
        .from(events)
        .where(
          and(
            eq(events.projectId, project.id),
            eq(events.name, '$pageview'),
            gte(events.timestamp, yesterday),
            lt(events.timestamp, today)
          )
        )
        .groupBy(events.pagePath)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      const topCountries = await db
        .select({
          country: events.country,
          count: sql<number>`count(*)`,
        })
        .from(events)
        .where(
          and(
            eq(events.projectId, project.id),
            gte(events.timestamp, yesterday),
            lt(events.timestamp, today)
          )
        )
        .groupBy(events.country)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      const topBrowsers = await db
        .select({
          browser: events.browser,
          count: sql<number>`count(*)`,
        })
        .from(events)
        .where(
          and(
            eq(events.projectId, project.id),
            gte(events.timestamp, yesterday),
            lt(events.timestamp, today)
          )
        )
        .groupBy(events.browser)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      const topDevices = await db
        .select({
          deviceType: events.deviceType,
          count: sql<number>`count(*)`,
        })
        .from(events)
        .where(
          and(
            eq(events.projectId, project.id),
            gte(events.timestamp, yesterday),
            lt(events.timestamp, today)
          )
        )
        .groupBy(events.deviceType)
        .orderBy(sql`count(*) desc`)
        .limit(5);

      const totalEvents = Number(eventStats[0]?.total || 0);
      const totalSessions = Number(sessionStats[0]?.total || 0);
      const bounceRate = totalSessions > 0
        ? Number(sessionStats[0]?.bounceCount || 0) / totalSessions * 100
        : 0;
      const safeBounceRate = Number.isFinite(bounceRate) ? bounceRate : 0;

      const metrics = {
        projectId: project.id,
        date: yesterday,
        totalEvents,
        uniqueUsers: uniqueUsersCount,
        sessions: totalSessions,
        pageviews: Number(eventStats[0]?.pageviews || 0),
        avgSessionDuration: Math.round(Number(sessionStats[0]?.avgDuration || 0)),
        bounceRate: safeBounceRate.toFixed(2),
        topSources: topSources.map(s => ({ source: s.source, count: Number(s.count) })),
        topPages: topPages.map(p => ({ page: p.page, count: Number(p.count) })),
        topCountries: topCountries.map(c => ({ country: c.country, count: Number(c.count) })),
        topBrowsers: topBrowsers.map(b => ({ browser: b.browser, count: Number(b.count) })),
        topDevices: topDevices.map(d => ({ deviceType: d.deviceType, count: Number(d.count) })),
        goalCompletions: {},
      };

      if (existing) {
        await db.update(dailyMetrics).set(metrics).where(eq(dailyMetrics.id, existing.id));
      } else {
        await db.insert(dailyMetrics).values(metrics);
      }
    }

    results.aggregate = { success: true, projectsProcessed: allProjects.length };
    console.log(`Aggregation complete: ${allProjects.length} projects processed`);
  } catch (error) {
    console.error('Aggregation error:', error);
  }

  // 3. WEBHOOKS - Process pending/failed webhook deliveries
  try {
    console.log('Processing webhook retries...');
    const MAX_RETRIES = 3;
    const WEBHOOK_TIMEOUT_MS = 10000; // 10 second timeout

    const pendingDeliveries = await db.query.webhookDeliveries.findMany({
      where: and(
        eq(webhookDeliveries.status, 'pending'),
        lt(webhookDeliveries.attempts, MAX_RETRIES)
      ),
      with: { webhook: true },
      limit: 100,
    });

    const failedDeliveries = await db.query.webhookDeliveries.findMany({
      where: and(
        eq(webhookDeliveries.status, 'failed'),
        lt(webhookDeliveries.attempts, MAX_RETRIES)
      ),
      with: { webhook: true },
      limit: 100,
    });

    const allDeliveries = [...pendingDeliveries, ...failedDeliveries];
    let successCount = 0;
    let failCount = 0;

    for (const delivery of allDeliveries) {
      if (!delivery.webhook || !delivery.webhook.enabled) continue;

      try {
        const payload = {
          deliveryId: delivery.id,
          eventId: delivery.eventId,
          timestamp: new Date().toISOString(),
        };

        const signature = await createSignature(JSON.stringify(payload), decryptSecret(delivery.webhook.secret));

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
          successCount++;
        } else {
          const fullBody = await response.text().catch(() => '');
          const RESPONSE_BODY_MAX = 10000;
          const truncated = fullBody.length > RESPONSE_BODY_MAX;
          const responseBody = truncated
            ? fullBody.substring(0, RESPONSE_BODY_MAX) + `\n[truncated, original ${fullBody.length} bytes]`
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
        failCount++;
      }
    }

    results.webhooks = {
      success: true,
      processed: allDeliveries.length,
      successCount,
      failCount,
    };
    console.log(`Webhook processing complete: ${successCount} success, ${failCount} failed`);
  } catch (error) {
    console.error('Webhook error:', error);
  }

  // 4. ALERTS - Evaluate threshold rules and fire notifications
  try {
    console.log('Evaluating alerts...');
    const { evaluateAlerts } = await import('@/lib/alerts/evaluator');
    const alertResult = await evaluateAlerts();
    results.alerts = { success: true, ...alertResult };
    console.log(`Alerts: ${alertResult.evaluated} evaluated, ${alertResult.fired} fired`);
  } catch (error) {
    console.error('Alerts error:', error);
  }

  // 5. WEEKLY DIGEST - Mondays at 9am-ish UTC only (cron schedule is 2am UTC,
  // but if the run shifts we still want Monday only).
  try {
    const dayOfWeek = new Date().getUTCDay();
    if (dayOfWeek === 1) {
      console.log('Sending weekly digests...');
      const { sendWeeklyDigests } = await import('@/lib/alerts/digest');
      const digestResult = await sendWeeklyDigests();
      results.digest = { success: true, sent: digestResult.sent };
      console.log(`Digests sent: ${digestResult.sent}`);
    } else {
      console.log(`Skipping weekly digest (today is day ${dayOfWeek}, not Monday)`);
    }
  } catch (error) {
    console.error('Digest error:', error);
  }

  console.log('Daily cron job complete');
  return NextResponse.json({ success: true, results });
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
