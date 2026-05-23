import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'API Keys',
};
import { db, apiKeys } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, KeyRound } from 'lucide-react';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { ApiKeysTable } from '@/components/dashboard/api-keys-table';
import { CreateApiKeyDialog } from '@/components/dashboard/create-api-key-dialog';

export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const membership = await getCurrentProjectWithRole(session.userId);
  if (!membership) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl space-y-4">
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">
            No project selected.{' '}
            <Link href="/dashboard" className="underline">
              Go to the dashboard
            </Link>{' '}
            to create or pick one.
          </p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const canEdit = role === 'owner' || role === 'editor';

  const keys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.projectId, project.id),
    orderBy: desc(apiKeys.createdAt),
  });

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">API Keys</h1>
              {role !== 'owner' && <RoleBadge role={role} />}
            </div>
            <p className="text-muted-foreground">
              Keys for <span className="font-medium text-foreground">{project.name}</span>. Use the project selector in the sidebar to view another project&apos;s keys.
            </p>
          </div>
          {canEdit && <CreateApiKeyDialog projectId={project.id} />}
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            The full <code>sk_live_...</code> value is shown <strong>once</strong> when you create a key. Save it somewhere safe — after the create dialog closes, only the prefix is visible. Revoke a key to immediately stop accepting requests with it.
          </AlertDescription>
        </Alert>

        {keys.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <KeyRound className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
              <p className="text-muted-foreground max-w-md mb-4">
                {canEdit
                  ? 'Create your first key to start sending events from your app to this project.'
                  : 'No keys exist for this project. Ask an owner or editor to create one.'}
              </p>
              {canEdit && <CreateApiKeyDialog projectId={project.id} />}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Keys</CardTitle>
              <CardDescription>
                {keys.filter(k => !k.revokedAt).length} active, {keys.filter(k => k.revokedAt).length} revoked
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApiKeysTable keys={keys} canEdit={canEdit} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>How to authenticate against the Serla API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">HTTP header</p>
              <code className="block p-3 bg-muted rounded-lg text-sm font-mono">
                Authorization: Bearer sk_live_...
              </code>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Example request</p>
              <pre className="p-3 bg-muted rounded-lg text-sm font-mono overflow-x-auto">
{`curl -X POST https://serla.dev/api/v1/events \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "signup_completed", "distinctId": "user_123" }'`}
              </pre>
            </div>

            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Security tips</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Never expose API keys in client-side code or commit them to git</li>
                <li>Use environment variables and a secret manager in production</li>
                <li>Revoke immediately if a key is compromised — create a new one and switch over</li>
                <li>Use separate keys per environment (e.g. staging vs prod) so you can revoke one without breaking the other</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
