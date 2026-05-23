import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { db, featureFlags, users } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToggleLeft, Plus } from 'lucide-react';
import { FeatureGate } from '@/components/dashboard/feature-gate';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { FlagDialog } from '@/components/dashboard/flag-dialog';
import { FlagToggle } from '@/components/dashboard/flag-toggle';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Feature Flags',
};

export default async function FlagsPage() {
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
          <h1 className="text-2xl font-bold mb-4">Feature Flags</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const canEdit = role === 'owner' || role === 'editor';

  const flags = await db.query.featureFlags.findMany({
    where: eq(featureFlags.projectId, project.id),
    orderBy: desc(featureFlags.createdAt),
  });

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Feature Flags</h1>
              {role !== 'owner' && <RoleBadge role={role} />}
            </div>
            <p className="text-muted-foreground">
              Ship code dark and roll it out gradually by user, percentage, or variant
            </p>
          </div>
          {canEdit && (
            <FlagDialog projectId={project.id}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New flag
              </Button>
            </FlagDialog>
          )}
        </div>

        <FeatureGate feature="featureFlags" userPlan={userPlan} requiredPlan="hobby">
          {flags.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ToggleLeft className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No flags yet</h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  Create a flag to toggle features on or off, run gradual rollouts, or A/B test variants.
                </p>
                {canEdit && (
                  <FlagDialog projectId={project.id}>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create your first flag
                    </Button>
                  </FlagDialog>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {flags.map(flag => {
                const variantCount = Array.isArray(flag.variants) ? flag.variants.length : 0;
                return (
                  <Card key={flag.id}>
                    <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-sm font-mono text-white bg-zinc-800/50 px-2 py-0.5 rounded">
                            {flag.key}
                          </code>
                          <span className="text-sm font-medium text-zinc-200">{flag.name}</span>
                          {variantCount > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {variantCount} variants
                            </Badge>
                          )}
                          {flag.rolloutPercentage < 100 && flag.enabled && (
                            <Badge variant="outline" className="text-[10px] text-blue-300 border-blue-500/40">
                              {flag.rolloutPercentage}% rollout
                            </Badge>
                          )}
                        </div>
                        {flag.description && (
                          <p className="text-xs text-zinc-500 mt-1">{flag.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {canEdit && <FlagToggle flagId={flag.id} enabled={flag.enabled} />}
                        {!canEdit && (
                          <Badge variant={flag.enabled ? 'default' : 'outline'} className="text-[10px]">
                            {flag.enabled ? 'On' : 'Off'}
                          </Badge>
                        )}
                        {canEdit && (
                          <FlagDialog projectId={project.id} flag={flag}>
                            <Button size="sm" variant="ghost" className="text-xs">
                              Edit
                            </Button>
                          </FlagDialog>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </FeatureGate>
      </div>
    </div>
  );
}
