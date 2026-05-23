import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Export',
};
import { db, events, projects, users } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/utils/project';
import { ExportForm } from '@/components/dashboard/export-form';
import { FeatureGate } from '@/components/dashboard/feature-gate';

async function getExportData(projectId: string) {
  const eventNames = await db
    .selectDistinct({ name: events.name })
    .from(events)
    .where(eq(events.projectId, projectId))
    .orderBy(events.name);

  const totalEvents = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(eq(events.projectId, projectId));

  return {
    eventNames: eventNames.map(e => e.name),
    totalEvents: Number(totalEvents[0]?.count || 0),
  };
}

export default async function ExportPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  // Get user's plan
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  const userPlan = user?.plan || 'free';

  const project = await getCurrentProject(session.userId);

  if (!project) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Export</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const exportData = await getExportData(project.id);

  return (
    <div className="min-h-full p-8 flex justify-center">
      <div className="w-full max-w-4xl">
        <h1 className="text-xl font-bold text-white mb-1">Export</h1>
        <p className="text-sm text-zinc-400 mb-8">
          Download your analytics data
        </p>

        <FeatureGate feature="export" userPlan={userPlan} requiredPlan="pro">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="bg-[#1a1a1a] rounded-xl p-6">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-white">Export Events</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  {exportData.totalEvents.toLocaleString()} events available
                </p>
              </div>
              <ExportForm
                projectId={project.id}
                eventNames={exportData.eventNames}
              />
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-6">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-white">API Export</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Export programmatically
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Endpoint</p>
                  <code className="block p-3 bg-[#0a0a0a] rounded-lg text-sm font-mono text-zinc-300">
                    GET /api/v1/export
                  </code>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Parameters</p>
                  <div className="text-sm text-zinc-500 space-y-1.5">
                    <div><code className="text-zinc-300">format</code> - json or csv</div>
                    <div><code className="text-zinc-300">startDate</code> - ISO date</div>
                    <div><code className="text-zinc-300">endDate</code> - ISO date</div>
                    <div><code className="text-zinc-300">eventName</code> - filter by event</div>
                    <div><code className="text-zinc-300">limit</code> - max 10,000</div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Example</p>
                  <code className="block p-3 bg-[#0a0a0a] rounded-lg text-xs font-mono text-zinc-400 break-all leading-relaxed">
                    curl -H &quot;Authorization: Bearer sk_live_...&quot; \<br />
                    &quot;https://serla.dev/api/v1/export?format=csv&quot;
                  </code>
                </div>
              </div>
            </div>
          </div>
        </FeatureGate>
      </div>
    </div>
  );
}
