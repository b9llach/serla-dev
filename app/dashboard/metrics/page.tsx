import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Metrics',
};
import { db, customMetrics, events, projects, users } from '@/lib/db';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Gauge, Trash2 } from 'lucide-react';
import { MetricDialog } from '@/components/dashboard/metric-dialog';
import { deleteMetric } from '@/lib/actions/metrics';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { RoleBadge } from '@/components/dashboard/role-badge';

async function getMetricsData(projectId: string) {
  const metrics = await db.query.customMetrics.findMany({
    where: eq(customMetrics.projectId, projectId),
    orderBy: desc(customMetrics.createdAt),
  });

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const metricsWithValues = await Promise.all(
    metrics.map(async (metric) => {
      let value = 0;

      const baseConditions = [
        eq(events.projectId, projectId),
        eq(events.name, metric.eventName),
        gte(events.timestamp, sevenDaysAgo),
      ];

      switch (metric.aggregation) {
        case 'count':
          const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(events)
            .where(and(...baseConditions));
          value = Number(countResult[0]?.count || 0);
          break;

        case 'unique':
          const uniqueResult = await db
            .select({ count: sql<number>`count(distinct ${events.distinctId})` })
            .from(events)
            .where(and(...baseConditions));
          value = Number(uniqueResult[0]?.count || 0);
          break;

        case 'sum':
        case 'avg':
        case 'min':
        case 'max':
          if (metric.property) {
            const aggFunc = metric.aggregation === 'sum' ? 'sum' :
                          metric.aggregation === 'avg' ? 'avg' :
                          metric.aggregation === 'min' ? 'min' : 'max';
            const aggResult = await db
              .select({
                value: sql<number>`${sql.raw(aggFunc)}((${events.properties}->>'${sql.raw(metric.property)}')::numeric)`
              })
              .from(events)
              .where(and(...baseConditions));
            value = Number(aggResult[0]?.value || 0);
          }
          break;
      }

      return {
        ...metric,
        value,
      };
    })
  );

  return metricsWithValues;
}

export default async function MetricsPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  const userPlan = user?.plan || 'free';

  const membership = await getCurrentProjectWithRole(session.userId);

  if (!membership) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Custom Metrics</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const canEdit = role === 'owner' || role === 'editor';
  const metricsData = await getMetricsData(project.id);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Custom Metrics</h1>
              {role !== 'owner' && <RoleBadge role={role} />}
            </div>
            <p className="text-muted-foreground">
              Define and track custom calculated metrics
            </p>
          </div>
        </div>

        <FeatureGate feature="customMetrics" userPlan={userPlan} requiredPlan="pro">
          <div className="space-y-6">
            {canEdit && (
              <div className="flex justify-end">
                <MetricDialog projectId={project.id}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Metric
                  </Button>
                </MetricDialog>
              </div>
            )}

            {metricsData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Gauge className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No custom metrics yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create custom metrics to track specific KPIs.
                  </p>
                  {canEdit && (
                    <MetricDialog projectId={project.id}>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create your first metric
                      </Button>
                    </MetricDialog>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {metricsData.map((metric) => (
                  <Card key={metric.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{metric.aggregation}</Badge>
                        {canEdit && (
                          <form action={deleteMetric.bind(null, metric.id)}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </form>
                        )}
                      </div>
                      <CardTitle className="text-lg">{metric.name}</CardTitle>
                      <CardDescription>
                        {metric.aggregation} of {metric.property || metric.eventName}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {metric.aggregation === 'avg'
                          ? metric.value.toFixed(2)
                          : metric.value.toLocaleString()}
                      </div>
                      <p className="text-sm text-muted-foreground">Last 7 days</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </FeatureGate>
      </div>
    </div>
  );
}
