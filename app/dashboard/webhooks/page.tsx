import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Webhooks',
};
import { db, webhooks, webhookDeliveries, projects, users } from '@/lib/db';
import { eq, desc, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Webhook, Trash2, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { WebhookDialog } from '@/components/dashboard/webhook-dialog';
import { deleteWebhook, toggleWebhook } from '@/lib/actions/webhooks';
import { Switch } from '@/components/ui/switch';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { WebhookType, getWebhookTypeInfo } from '@/lib/webhooks/formatters';

// Integration icons
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  );
}

function TeamsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.625 8.073h-5.27V5.073a1.667 1.667 0 0 0-1.666-1.667H8.31a1.667 1.667 0 0 0-1.667 1.667v3H1.375a1.125 1.125 0 0 0-1.125 1.125v9.5A1.125 1.125 0 0 0 1.375 19.823h19.25a1.125 1.125 0 0 0 1.125-1.125v-9.5a1.125 1.125 0 0 0-1.125-1.125zM8.31 5.073h5.38v3H8.31v-3zm5.38 12.75H8.31v-3h5.38v3z"/>
      <circle cx="18.5" cy="4.5" r="2.5"/>
    </svg>
  );
}

function getWebhookIcon(type: WebhookType) {
  switch (type) {
    case 'discord':
      return <DiscordIcon className="h-5 w-5 text-[#5865F2]" />;
    case 'slack':
      return <SlackIcon className="h-5 w-5 text-[#4A154B]" />;
    case 'teams':
      return <TeamsIcon className="h-5 w-5 text-[#6264A7]" />;
    default:
      return <Webhook className="h-5 w-5 text-zinc-400" />;
  }
}

async function getWebhooksData(projectId: string) {
  const userWebhooks = await db.query.webhooks.findMany({
    where: eq(webhooks.projectId, projectId),
    orderBy: desc(webhooks.createdAt),
  });

  const webhooksWithStats = await Promise.all(
    userWebhooks.map(async (webhook) => {
      const deliveryStats = await db
        .select({
          status: webhookDeliveries.status,
          count: sql<number>`count(*)`,
        })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, webhook.id))
        .groupBy(webhookDeliveries.status);

      const stats = {
        success: 0,
        failed: 0,
        pending: 0,
      };

      for (const stat of deliveryStats) {
        if (stat.status === 'success') stats.success = Number(stat.count);
        else if (stat.status === 'failed') stats.failed = Number(stat.count);
        else if (stat.status === 'pending') stats.pending = Number(stat.count);
      }

      return {
        ...webhook,
        type: (webhook.type || 'raw') as WebhookType,
        name: webhook.name || 'Webhook',
        events: webhook.events as string[],
        stats,
      };
    })
  );

  return webhooksWithStats;
}

export default async function WebhooksPage() {
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
          <h1 className="text-2xl font-bold mb-4">Webhooks</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const canEdit = role === 'owner' || role === 'editor';
  const webhooksData = await getWebhooksData(project.id);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Webhooks</h1>
              {role !== 'owner' && <RoleBadge role={role} />}
            </div>
            <p className="text-muted-foreground">
              Send real-time event data to external services
            </p>
          </div>
        </div>

        <FeatureGate feature="webhooks" userPlan={userPlan} requiredPlan="hobby">
          <div className="space-y-6">
            {canEdit && (
              <div className="flex justify-end">
                <WebhookDialog projectId={project.id}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Webhook
                  </Button>
                </WebhookDialog>
              </div>
            )}

            {webhooksData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No webhooks yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create webhooks to send event data to your services in real-time.
                  </p>
                  {canEdit && (
                    <WebhookDialog projectId={project.id}>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create your first webhook
                      </Button>
                    </WebhookDialog>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {webhooksData.map((webhook) => (
                  <Card key={webhook.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getWebhookIcon(webhook.type)}
                          <div className="flex items-center gap-3">
                            <CardTitle className="text-lg">
                              {webhook.name}
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              {getWebhookTypeInfo(webhook.type).label}
                            </Badge>
                          </div>
                          {canEdit && (
                            <form action={toggleWebhook.bind(null, webhook.id, !webhook.enabled)}>
                              <button
                                type="submit"
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                                  webhook.enabled ? 'bg-cyan-500' : 'bg-zinc-700'
                                }`}
                              >
                                <span
                                  className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
                                    webhook.enabled ? 'translate-x-4' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </form>
                          )}
                        </div>
                        {canEdit && (
                          <form action={deleteWebhook.bind(null, webhook.id)}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </form>
                        )}
                      </div>
                      <CardDescription className="ml-8">
                        {webhook.url}
                      </CardDescription>
                      <CardDescription className="ml-8 text-xs">
                        Triggers on: {webhook.events.length > 0 ? webhook.events.join(', ') : 'all events'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {webhook.disabledAt && (
                        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-medium">
                              Auto-disabled after {webhook.consecutiveFailures} consecutive failures
                            </p>
                            <p className="text-xs text-red-300/80">
                              Toggle the switch to re-enable once the destination is fixed.
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-6 text-sm flex-wrap">
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span>{webhook.stats.success} successful</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span>{webhook.stats.failed} failed</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-yellow-500" />
                            <span>{webhook.stats.pending} pending</span>
                          </div>
                        </div>
                        <Link
                          href={`/dashboard/webhooks/${webhook.id}`}
                          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          View delivery log →
                        </Link>
                      </div>
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
