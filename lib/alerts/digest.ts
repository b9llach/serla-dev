import { db, projects, users, events, sessions, dailyUserSeen } from '@/lib/db';
import { and, eq, gte, lt, sql, isNull, desc } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface DigestData {
  projectName: string;
  thisWeek: { events: number; users: number; sessions: number };
  lastWeek: { events: number; users: number; sessions: number };
  topEvents: Array<{ name: string; count: number }>;
}

function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+∞' : '—';
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(0)}%`;
}

async function gatherProjectDigest(projectId: string, projectName: string): Promise<DigestData | null> {
  const now = new Date();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const thisWeekStart = new Date(now.getTime() - oneWeekMs);
  const lastWeekStart = new Date(now.getTime() - 2 * oneWeekMs);

  // Per-week totals in a single pair of queries.
  async function weekTotals(start: Date, end: Date) {
    const [eventsRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(and(eq(events.projectId, projectId), gte(events.timestamp, start), lt(events.timestamp, end)));

    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const [usersRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dailyUserSeen)
      .where(and(eq(dailyUserSeen.projectId, projectId), gte(dailyUserSeen.date, startDate), lt(dailyUserSeen.date, endDate)));

    const [sessionsRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(and(eq(sessions.projectId, projectId), gte(sessions.startedAt, start), lt(sessions.startedAt, end)));

    return {
      events: Number(eventsRow?.count ?? 0),
      users: Number(usersRow?.count ?? 0),
      sessions: Number(sessionsRow?.count ?? 0),
    };
  }

  const thisWeek = await weekTotals(thisWeekStart, now);
  const lastWeek = await weekTotals(lastWeekStart, thisWeekStart);

  // Skip digests for projects with no activity at all.
  if (thisWeek.events === 0 && lastWeek.events === 0) {
    return null;
  }

  const topEventsRaw = await db
    .select({ name: events.name, count: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.projectId, projectId), gte(events.timestamp, thisWeekStart), lt(events.timestamp, now)))
    .groupBy(events.name)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  return {
    projectName,
    thisWeek,
    lastWeek,
    topEvents: topEventsRaw.map(r => ({ name: r.name, count: Number(r.count) })),
  };
}

function renderDigestEmail(data: DigestData[]): { subject: string; text: string; html: string } {
  if (data.length === 0) {
    return {
      subject: '[Serla] Weekly digest — no activity',
      text: 'No events recorded this week. Send events to see analytics here.',
      html: '<p>No events recorded this week.</p>',
    };
  }

  const summary = data.length === 1
    ? data[0]!.projectName
    : `${data.length} projects`;
  const subject = `[Serla] Weekly digest — ${summary}`;

  const textBlocks = data.map(d => {
    const e = d.thisWeek.events.toLocaleString();
    const u = d.thisWeek.users.toLocaleString();
    const s = d.thisWeek.sessions.toLocaleString();
    const eChange = pctChange(d.thisWeek.events, d.lastWeek.events);
    const uChange = pctChange(d.thisWeek.users, d.lastWeek.users);
    const sChange = pctChange(d.thisWeek.sessions, d.lastWeek.sessions);
    const top = d.topEvents.length > 0
      ? d.topEvents.map(t => `  • ${t.name}: ${t.count.toLocaleString()}`).join('\n')
      : '  (no events)';
    return `${d.projectName}\n  Events: ${e} (${eChange})\n  Users: ${u} (${uChange})\n  Sessions: ${s} (${sChange})\n  Top events:\n${top}`;
  });

  const text =
    `Your weekly Serla digest for ${summary}.\n\n` +
    textBlocks.join('\n\n') +
    `\n\nView dashboard: ${APP_URL}/dashboard`;

  const htmlBlocks = data.map(d => `
    <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:16px;">
      <h3 style="margin:0 0 12px; color:#111;">${escapeHtml(d.projectName)}</h3>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:4px 0; color:#666;">Events</td><td style="padding:4px 0; text-align:right;"><b>${d.thisWeek.events.toLocaleString()}</b> <span style="color:${d.thisWeek.events >= d.lastWeek.events ? '#16a34a' : '#dc2626'}">${pctChange(d.thisWeek.events, d.lastWeek.events)}</span></td></tr>
        <tr><td style="padding:4px 0; color:#666;">Unique users</td><td style="padding:4px 0; text-align:right;"><b>${d.thisWeek.users.toLocaleString()}</b> <span style="color:${d.thisWeek.users >= d.lastWeek.users ? '#16a34a' : '#dc2626'}">${pctChange(d.thisWeek.users, d.lastWeek.users)}</span></td></tr>
        <tr><td style="padding:4px 0; color:#666;">Sessions</td><td style="padding:4px 0; text-align:right;"><b>${d.thisWeek.sessions.toLocaleString()}</b> <span style="color:${d.thisWeek.sessions >= d.lastWeek.sessions ? '#16a34a' : '#dc2626'}">${pctChange(d.thisWeek.sessions, d.lastWeek.sessions)}</span></td></tr>
      </table>
      ${d.topEvents.length > 0 ? `
        <p style="margin:16px 0 4px; font-size:12px; color:#666; text-transform:uppercase; letter-spacing:0.05em;">Top events</p>
        <ul style="margin:0; padding-left:20px; font-size:14px; color:#222;">
          ${d.topEvents.map(t => `<li>${escapeHtml(t.name)} — ${t.count.toLocaleString()}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `).join('');

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="margin:0 0 24px; color:#111;">Your weekly Serla digest</h2>
      ${htmlBlocks}
      <p style="margin-top:24px; font-size:13px; color:#666;">
        <a href="${APP_URL}/dashboard" style="color:#2563eb;">Open dashboard →</a>
      </p>
      <p style="margin-top:32px; font-size:11px; color:#999;">
        You're receiving this because you have weekly digests enabled.
        <a href="${APP_URL}/dashboard/settings" style="color:#999;">Manage email preferences</a>.
      </p>
    </div>
  `;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * Send weekly digest emails to every user who has it enabled.
 * Each user gets one email summarizing all their (non-deleted) projects.
 */
export async function sendWeeklyDigests(): Promise<{ sent: number }> {
  const optedInUsers = await db.query.users.findMany({
    where: and(eq(users.weeklyDigestEnabled, true), isNull(users.deletedAt)),
    columns: { id: true, email: true },
  });

  let sent = 0;
  for (const u of optedInUsers) {
    const userProjects = await db.query.projects.findMany({
      where: and(eq(projects.userId, u.id), isNull(projects.deletedAt)),
      columns: { id: true, name: true },
    });
    if (userProjects.length === 0) continue;

    const digests: DigestData[] = [];
    for (const p of userProjects) {
      const d = await gatherProjectDigest(p.id, p.name);
      if (d) digests.push(d);
    }
    if (digests.length === 0) continue;

    const email = renderDigestEmail(digests);
    const ok = await sendEmail({ to: u.email, ...email });
    if (ok) sent++;
  }

  return { sent };
}
