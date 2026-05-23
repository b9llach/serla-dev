import { NextRequest, NextResponse } from 'next/server';
import { db, events, sessions, projects, passwordResetTokens, emailVerificationTokens } from '@/lib/db';
import { lt, and, eq, sql, or, isNotNull } from 'drizzle-orm';
import { validateCronSecret } from '@/lib/utils/crypto';
import { acquireCronLock, releaseCronLock } from '@/lib/utils/cron-lock';

// Vercel Cron: Run daily at 3 AM UTC
// Add to vercel.json: { "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }] }

const BATCH_SIZE = 1000; // Delete in batches to avoid table locks
const MAX_BATCHES = 100; // Safety limit to prevent runaway deletes

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (!validateCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockAcquired = await acquireCronLock('cleanup', 3000);
  if (!lockAcquired) {
    return NextResponse.json({ skipped: 'already running' });
  }

  const results = {
    eventsDeleted: 0,
    sessionsDeleted: 0,
    tokensDeleted: 0,
    projectsProcessed: 0,
  };

  try {
    console.log('Starting retention cleanup...');

    // Get all projects with their retention settings
    const allProjects = await db.query.projects.findMany();

    for (const project of allProjects) {
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - project.retentionDays);

      // Delete old events in batches
      let eventsDeleted = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const result = await db.execute(sql`
          DELETE FROM events
          WHERE id IN (
            SELECT id FROM events
            WHERE project_id = ${project.id}
            AND timestamp < ${retentionDate}
            LIMIT ${BATCH_SIZE}
          )
        `);

        const deletedCount = Number(result.rowCount || 0);
        eventsDeleted += deletedCount;

        if (deletedCount < BATCH_SIZE) {
          break; // No more to delete
        }
      }

      // Delete old sessions in batches
      let sessionsDeleted = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const result = await db.execute(sql`
          DELETE FROM sessions
          WHERE id IN (
            SELECT id FROM sessions
            WHERE project_id = ${project.id}
            AND started_at < ${retentionDate}
            LIMIT ${BATCH_SIZE}
          )
        `);

        const deletedCount = Number(result.rowCount || 0);
        sessionsDeleted += deletedCount;

        if (deletedCount < BATCH_SIZE) {
          break;
        }
      }

      results.eventsDeleted += eventsDeleted;
      results.sessionsDeleted += sessionsDeleted;
      results.projectsProcessed++;

      if (eventsDeleted > 0 || sessionsDeleted > 0) {
        console.log(
          `Project ${project.id}: Deleted ${eventsDeleted} events and ${sessionsDeleted} sessions older than ${project.retentionDays} days`
        );
      }
    }

    // Clean up expired/used password reset tokens (older than 7 days)
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

    // Clean up expired/used email verification tokens
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

    results.tokensDeleted = passwordTokensResult.length + emailTokensResult.length;

    console.log(
      `Cleanup complete. Events: ${results.eventsDeleted}, Sessions: ${results.sessionsDeleted}, Tokens: ${results.tokensDeleted}`
    );

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed', partial: results },
      { status: 500 }
    );
  } finally {
    await releaseCronLock('cleanup');
  }
}
