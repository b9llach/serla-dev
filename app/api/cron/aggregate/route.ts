import { NextRequest, NextResponse } from 'next/server';
import { db, events, sessions, dailyMetrics, projects } from '@/lib/db';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { validateCronSecret } from '@/lib/utils/crypto';
import { acquireCronLock, releaseCronLock } from '@/lib/utils/cron-lock';

// Vercel Cron: Run hourly at minute 0
// Add to vercel.json: { "crons": [{ "path": "/api/cron/aggregate", "schedule": "0 * * * *" }] }

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (!validateCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockAcquired = await acquireCronLock('aggregate', 3000);
  if (!lockAcquired) {
    return NextResponse.json({ skipped: 'already running' });
  }

  try {
    console.log('Starting daily metrics aggregation...');

    // Aggregate for yesterday (to ensure complete data)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get all projects
    const allProjects = await db.query.projects.findMany();

    for (const project of allProjects) {
      // Check if metrics already exist for this day
      const existing = await db.query.dailyMetrics.findFirst({
        where: and(
          eq(dailyMetrics.projectId, project.id),
          eq(dailyMetrics.date, yesterday)
        ),
      });

      // Get event counts
      const eventStats = await db
        .select({
          total: sql<number>`count(*)`,
          pageviews: sql<number>`count(*) filter (where ${events.name} = '$pageview')`,
          uniqueUsers: sql<number>`count(distinct ${events.distinctId})`,
        })
        .from(events)
        .where(
          and(
            eq(events.projectId, project.id),
            gte(events.timestamp, yesterday),
            lt(events.timestamp, today)
          )
        );

      // Get session stats
      const sessionStats = await db
        .select({
          total: sql<number>`count(*)`,
          avgDuration: sql<number>`avg(${sessions.duration})`,
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

      // Get top sources
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

      // Get top pages
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

      // Get top countries
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

      // Get top browsers
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

      // Get top devices
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

      const metrics = {
        projectId: project.id,
        date: yesterday,
        totalEvents: totalEvents,
        uniqueUsers: Number(eventStats[0]?.uniqueUsers || 0),
        sessions: totalSessions,
        pageviews: Number(eventStats[0]?.pageviews || 0),
        avgSessionDuration: Math.round(Number(sessionStats[0]?.avgDuration || 0)),
        bounceRate: bounceRate.toFixed(2),
        topSources: topSources.map(s => ({ source: s.source, count: Number(s.count) })),
        topPages: topPages.map(p => ({ page: p.page, count: Number(p.count) })),
        topCountries: topCountries.map(c => ({ country: c.country, count: Number(c.count) })),
        topBrowsers: topBrowsers.map(b => ({ browser: b.browser, count: Number(b.count) })),
        topDevices: topDevices.map(d => ({ deviceType: d.deviceType, count: Number(d.count) })),
        goalCompletions: {},
      };

      if (existing) {
        // Update existing metrics
        await db.update(dailyMetrics)
          .set(metrics)
          .where(eq(dailyMetrics.id, existing.id));
      } else {
        // Insert new metrics
        await db.insert(dailyMetrics).values(metrics);
      }

      console.log(`Aggregated metrics for project ${project.id}: ${totalEvents} events, ${totalSessions} sessions`);
    }

    console.log('Aggregation complete');

    return NextResponse.json({
      success: true,
      date: yesterday.toISOString(),
      projectsProcessed: allProjects.length,
    });
  } catch (error) {
    console.error('Aggregation error:', error);
    return NextResponse.json(
      { error: 'Aggregation failed' },
      { status: 500 }
    );
  } finally {
    await releaseCronLock('aggregate');
  }
}
