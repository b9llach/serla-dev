import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { db, llmGenerations, users } from '@/lib/db';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, DollarSign, Clock, AlertCircle, Activity } from 'lucide-react';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { parseRangeFromSearchParams } from '@/lib/utils/date-range';
import { formatDateTime } from '@/lib/utils/date';

export const metadata: Metadata = {
  title: 'LLM Observability',
};

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function LLMPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/auth/signin');

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  const userPlan = user?.plan || 'free';

  const membership = await getCurrentProjectWithRole(session.userId);
  if (!membership) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">LLM Observability</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const params = await searchParams;
  const { from, to } = parseRangeFromSearchParams(params, 7);

  // Aggregates over the selected window.
  const aggResult = await db
    .select({
      totalCalls: sql<number>`count(*)`,
      totalCost: sql<number>`coalesce(sum(${llmGenerations.costUsd}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${llmGenerations.totalTokens}), 0)`,
      avgLatency: sql<number>`coalesce(avg(${llmGenerations.latencyMs}), 0)`,
      errorCount: sql<number>`count(*) filter (where ${llmGenerations.status} = 'error')`,
      // Generations we couldn't price: tokens were reported but the model
      // isn't in the price table. Without surfacing this, the cost total
      // silently under-reports and looks authoritative.
      unpricedCount: sql<number>`count(*) filter (where ${llmGenerations.costUsd} is null and ${llmGenerations.totalTokens} is not null)`,
    })
    .from(llmGenerations)
    .where(
      and(
        eq(llmGenerations.projectId, project.id),
        gte(llmGenerations.timestamp, from),
      ),
    );
  const agg = aggResult[0]!;

  // Breakdown by model.
  const byModel = await db
    .select({
      model: llmGenerations.model,
      count: sql<number>`count(*)`,
      cost: sql<number>`coalesce(sum(${llmGenerations.costUsd}), 0)`,
      avgLatency: sql<number>`coalesce(avg(${llmGenerations.latencyMs}), 0)`,
    })
    .from(llmGenerations)
    .where(
      and(
        eq(llmGenerations.projectId, project.id),
        gte(llmGenerations.timestamp, from),
      ),
    )
    .groupBy(llmGenerations.model)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  // Recent generations for the table.
  const recent = await db.query.llmGenerations.findMany({
    where: and(
      eq(llmGenerations.projectId, project.id),
      gte(llmGenerations.timestamp, from),
    ),
    orderBy: desc(llmGenerations.timestamp),
    limit: 50,
  });

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">LLM Observability</h1>
              {role !== 'owner' && <RoleBadge role={role} />}
            </div>
            <p className="text-muted-foreground">
              Track every prompt, completion, token, and dollar
            </p>
          </div>
          <DateRangePicker defaultPreset="7d" />
        </div>

        <FeatureGate feature="llmObservability" userPlan={userPlan} requiredPlan="hobby">
          {Number(agg.totalCalls) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No generations yet</h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  Track an LLM call from your code with{' '}
                  <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">serla.trackLLM(...)</code>{' '}
                  to see prompt, completion, tokens, cost, and latency here.
                </p>
                <Link
                  href="/docs"
                  className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  View SDK docs →
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Calls"
                  value={formatNumber(Number(agg.totalCalls))}
                  icon={Activity}
                />
                <StatCard
                  label="Cost"
                  value={formatCost(Number(agg.totalCost))}
                  icon={DollarSign}
                />
                <StatCard
                  label="Tokens"
                  value={formatNumber(Number(agg.totalTokens))}
                  icon={Sparkles}
                />
                <StatCard
                  label="Avg latency"
                  value={formatLatency(Number(agg.avgLatency))}
                  icon={Clock}
                />
              </div>

              {Number(agg.errorCount) > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-red-300">
                    {Number(agg.errorCount).toLocaleString()} failed calls in this window
                  </span>
                </div>
              )}

              {Number(agg.unpricedCount) > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-amber-200">
                    {Number(agg.unpricedCount).toLocaleString()} generations aren&apos;t priced, so
                    the cost above is an underestimate. Their model isn&apos;t in the price table —
                    pass <code className="bg-zinc-800 px-1 rounded text-xs">costUsd</code> explicitly
                    when tracking, or run{' '}
                    <code className="bg-zinc-800 px-1 rounded text-xs">npm run pricing:sync</code> to
                    pick up newer models.
                  </span>
                </div>
              )}

              {byModel.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-sm font-medium text-zinc-200 mb-3">By model</h2>
                    <div className="space-y-2">
                      {byModel.map(m => (
                        <div
                          key={m.model}
                          className="flex items-center justify-between text-sm bg-zinc-800/30 rounded-lg px-3 py-2"
                        >
                          <span className="font-mono text-white truncate">{m.model}</span>
                          <div className="flex items-center gap-4 text-zinc-400 shrink-0">
                            <span>{formatNumber(Number(m.count))} calls</span>
                            <span>{formatCost(Number(m.cost))}</span>
                            <span>{formatLatency(Number(m.avgLatency))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4">
                  <h2 className="text-sm font-medium text-zinc-200 mb-3">Recent generations</h2>
                  <div className="space-y-1">
                    {recent.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 text-xs bg-zinc-800/20 rounded-md px-3 py-2"
                      >
                        <span className="font-mono text-zinc-300 truncate flex-1 min-w-0">
                          {r.model}
                        </span>
                        {r.status === 'error' && (
                          <Badge variant="outline" className="text-red-400 border-red-500/40 text-[10px]">
                            error
                          </Badge>
                        )}
                        <span className="text-zinc-500 shrink-0">
                          {r.totalTokens?.toLocaleString() ?? '-'} tok
                        </span>
                        <span className="text-zinc-500 shrink-0 w-16 text-right">
                          {r.costUsd ? formatCost(Number(r.costUsd)) : '-'}
                        </span>
                        <span className="text-zinc-500 shrink-0 w-16 text-right">
                          {r.latencyMs ? formatLatency(r.latencyMs) : '-'}
                        </span>
                        <span className="text-zinc-600 shrink-0 hidden md:inline">
                          {formatDateTime(r.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </FeatureGate>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
          <Icon className="h-3.5 w-3.5 text-zinc-500" />
        </div>
        <p className="text-2xl font-medium text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
