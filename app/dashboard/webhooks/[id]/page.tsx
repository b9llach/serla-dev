import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Webhook Deliveries',
};

import { db, webhooks, webhookDeliveries, projects } from '@/lib/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, XCircle, Clock, Send } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/date';
import { retryWebhookDelivery } from '@/lib/actions/webhooks';
import { getProjectMembership } from '@/lib/utils/project';
import { RoleBadge } from '@/components/dashboard/role-badge';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: 'success' | 'failed' | 'pending' }>;
}

const PAGE_SIZE = 50;

function statusBadge(status: string) {
  if (status === 'success') {
    return (
      <Badge variant="outline" className="text-green-500 border-green-500/50">
        <CheckCircle className="h-3 w-3 mr-1" />
        Success
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge variant="outline" className="text-red-500 border-red-500/50">
        <XCircle className="h-3 w-3 mr-1" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
      <Clock className="h-3 w-3 mr-1" />
      Pending
    </Badge>
  );
}

export default async function WebhookDeliveriesPage({ params, searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/auth/signin');

  const { id } = await params;
  const { status: statusFilter } = await searchParams;

  // Load webhook + verify access via project membership.
  const webhook = await db.query.webhooks.findFirst({
    where: eq(webhooks.id, id),
  });
  if (!webhook) notFound();
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, webhook.projectId), isNull(projects.deletedAt)),
  });
  if (!project) notFound();
  const role = await getProjectMembership(session.userId, project.id);
  if (!role) notFound();
  const canEdit = role === 'owner' || role === 'editor';

  const baseWhere = statusFilter
    ? and(eq(webhookDeliveries.webhookId, id), eq(webhookDeliveries.status, statusFilter))
    : eq(webhookDeliveries.webhookId, id);

  const deliveries = await db.query.webhookDeliveries.findMany({
    where: baseWhere,
    orderBy: desc(webhookDeliveries.createdAt),
    limit: PAGE_SIZE,
  });

  const STATUS_TABS: Array<{ id: 'success' | 'failed' | 'pending' | undefined; label: string }> = [
    { id: undefined, label: 'All' },
    { id: 'success', label: 'Success' },
    { id: 'failed', label: 'Failed' },
    { id: 'pending', label: 'Pending' },
  ];

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <Link
            href="/dashboard/webhooks"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to webhooks
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{webhook.name}</h1>
            {role !== 'owner' && <RoleBadge role={role} />}
          </div>
          <p className="text-sm text-muted-foreground truncate">{webhook.url}</p>
        </div>

        {webhook.disabledAt && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            Auto-disabled after {webhook.consecutiveFailures} consecutive failures.
            Re-enable from the webhooks list once the destination is fixed.
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_TABS.map(t => (
            <Link
              key={t.id ?? 'all'}
              href={t.id ? `/dashboard/webhooks/${id}?status=${t.id}` : `/dashboard/webhooks/${id}`}
              className={
                (statusFilter ?? undefined) === t.id
                  ? 'inline-flex items-center rounded-full bg-zinc-800 text-white px-3 py-1 text-xs'
                  : 'inline-flex items-center rounded-full border border-zinc-800 text-zinc-400 hover:text-zinc-200 px-3 py-1 text-xs'
              }
            >
              {t.label}
            </Link>
          ))}
        </div>

        {deliveries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No deliveries yet.
              {statusFilter && (
                <>
                  {' '}
                  <Link href={`/dashboard/webhooks/${id}`} className="underline">
                    View all
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {deliveries.map(d => (
              <Card key={d.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      {statusBadge(d.status)}
                      {d.statusCode != null && (
                        <span className="text-sm font-mono text-zinc-400">HTTP {d.statusCode}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Attempt {d.attempts || 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {d.lastAttemptAt
                          ? formatDateTime(d.lastAttemptAt)
                          : formatDateTime(d.createdAt)}
                      </span>
                      {d.status !== 'success' && canEdit && (
                        <form action={retryWebhookDelivery.bind(null, d.id)}>
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {d.responseBody && (
                  <CardContent className="pt-0">
                    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all text-zinc-400 bg-[#0a0a0a] rounded-md p-2 max-h-32 overflow-auto">
                      {d.responseBody}
                    </pre>
                  </CardContent>
                )}
              </Card>
            ))}
            {deliveries.length === PAGE_SIZE && (
              <p className="text-xs text-muted-foreground text-center">
                Showing the most recent {PAGE_SIZE} deliveries.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
