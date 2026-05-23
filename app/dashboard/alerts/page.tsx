import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Alerts',
};
import { db, alerts, alertDeliveries, webhooks, users } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Bell, Trash2, Clock, Mail, Webhook } from 'lucide-react';
import { AlertDialog } from '@/components/dashboard/alert-dialog';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { deleteAlert, toggleAlert } from '@/lib/actions/alerts';
import { formatDistanceToNow } from 'date-fns';

const METRIC_LABELS: Record<string, string> = {
  events: 'events',
  users: 'unique users',
  sessions: 'sessions',
  event_count: 'event count',
};

const COMPARATOR_LABELS: Record<string, string> = {
  gt: '>',
  lt: '<',
};

const WINDOW_LABELS: Record<string, string> = {
  '24h': '24h',
  '7d': '7d',
};

function formatThreshold(value: string | number): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  // Drop trailing zeros from decimal portion
  return num % 1 === 0 ? num.toLocaleString() : num.toLocaleString();
}

async function getAlertsData(projectId: string) {
  const projectAlerts = await db.query.alerts.findMany({
    where: eq(alerts.projectId, projectId),
    orderBy: desc(alerts.createdAt),
  });

  const alertsWithDeliveries = await Promise.all(
    projectAlerts.map(async (alert) => {
      const lastDelivery = await db.query.alertDeliveries.findFirst({
        where: eq(alertDeliveries.alertId, alert.id),
        orderBy: desc(alertDeliveries.triggeredAt),
      });
      return { ...alert, lastDelivery: lastDelivery || null };
    })
  );

  return alertsWithDeliveries;
}

async function getProjectWebhooks(projectId: string) {
  return db.query.webhooks.findMany({
    where: eq(webhooks.projectId, projectId),
    columns: { id: true, name: true },
    orderBy: desc(webhooks.createdAt),
  });
}

export default async function AlertsPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  const userPlan = user?.plan || 'free';
  const defaultEmail = user?.email || session.email || '';

  const membership = await getCurrentProjectWithRole(session.userId);

  if (!membership) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Alerts</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const canEdit = role === 'owner' || role === 'editor';

  const [alertsData, projectWebhooks] = await Promise.all([
    getAlertsData(project.id),
    getProjectWebhooks(project.id),
  ]);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Alerts</h1>
              {role !== 'owner' && <RoleBadge role={role} />}
            </div>
            <p className="text-muted-foreground">
              Get notified when metrics cross thresholds
            </p>
          </div>
        </div>

        <FeatureGate feature="alerts" userPlan={userPlan} requiredPlan="hobby">
          <div className="space-y-6">
            {canEdit && (
              <div className="flex justify-end">
                <AlertDialog
                  projectId={project.id}
                  projectWebhooks={projectWebhooks}
                  defaultEmail={defaultEmail}
                >
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Alert
                  </Button>
                </AlertDialog>
              </div>
            )}

            {alertsData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No alerts yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create alerts to be notified when your metrics cross
                    important thresholds.
                  </p>
                  {canEdit && (
                    <AlertDialog
                      projectId={project.id}
                      projectWebhooks={projectWebhooks}
                      defaultEmail={defaultEmail}
                    >
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create your first alert
                      </Button>
                    </AlertDialog>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {alertsData.map((alert) => {
                  const metricLabel =
                    alert.metric === 'event_count' && alert.eventName
                      ? alert.eventName
                      : METRIC_LABELS[alert.metric] || alert.metric;
                  const comparatorLabel =
                    COMPARATOR_LABELS[alert.comparator] || alert.comparator;
                  const windowLabel =
                    WINDOW_LABELS[alert.windowSize] || alert.windowSize;
                  const conditionLabel = `${metricLabel} ${comparatorLabel} ${formatThreshold(alert.threshold)} in ${windowLabel}`;

                  return (
                    <Card key={alert.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <CardTitle className="text-lg truncate">
                              {alert.name}
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {conditionLabel}
                            </Badge>
                            {canEdit && (
                              <form
                                action={toggleAlert.bind(
                                  null,
                                  alert.id,
                                  !alert.enabled
                                )}
                              >
                                <button
                                  type="submit"
                                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                                    alert.enabled ? 'bg-cyan-500' : 'bg-zinc-700'
                                  }`}
                                  aria-label={
                                    alert.enabled
                                      ? 'Disable alert'
                                      : 'Enable alert'
                                  }
                                >
                                  <span
                                    className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
                                      alert.enabled
                                        ? 'translate-x-4'
                                        : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </form>
                            )}
                          </div>
                          {canEdit && (
                            <form action={deleteAlert.bind(null, alert.id)}>
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                aria-label="Delete alert"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </form>
                          )}
                        </div>
                        <CardDescription className="flex items-center gap-3 flex-wrap text-xs">
                          {alert.notifyEmail && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {alert.notifyEmail}
                            </span>
                          )}
                          {alert.webhookId && (
                            <span className="inline-flex items-center gap-1">
                              <Webhook className="h-3 w-3" />
                              Webhook notification
                            </span>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {alert.lastDelivery ? (
                            <span>
                              Last triggered{' '}
                              {formatDistanceToNow(
                                new Date(alert.lastDelivery.triggeredAt),
                                { addSuffix: true }
                              )}
                              {alert.lastDelivery.deliveryStatus !==
                                'success' && (
                                <span className="ml-2 text-red-400">
                                  (delivery {alert.lastDelivery.deliveryStatus})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span>Not triggered yet</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </FeatureGate>
      </div>
    </div>
  );
}
