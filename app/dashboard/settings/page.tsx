import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Settings',
};
import { db, projects, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SettingsForm } from './settings-form';
import { PasswordChangeForm } from './password-form';
import { DeleteAccountForm } from './delete-account-form';
import { RoleBadge } from '@/components/dashboard/role-badge';

async function getSettingsData(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const membership = await getCurrentProjectWithRole(userId);

  return { user, membership };
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const { user, membership } = await getSettingsData(session.userId);

  if (!user || !membership) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Settings</h1>
          <p className="text-muted-foreground">No data found.</p>
        </div>
      </div>
    );
  }

  const { project, role } = membership;
  const canEdit = role === 'owner' || role === 'editor';
  const isOwner = role === 'owner';

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Settings</h1>
            {role !== 'owner' && <RoleBadge role={role} />}
          </div>
          <p className="text-muted-foreground">
            Manage your account and project settings
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your personal account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingsForm
              type="user"
              initialData={{
                name: user.name || '',
                email: user.email,
                plan: user.plan,
                weeklyDigestEnabled: user.weeklyDigestEnabled,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Change your account password</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordChangeForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Settings</CardTitle>
            <CardDescription>
              {canEdit
                ? `Configure your project: ${project.name}`
                : `Viewing project: ${project.name}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingsForm
              type="project"
              projectId={project.id}
              userPlan={user.plan}
              readOnly={!canEdit}
              initialData={{
                name: project.name,
                domain: project.domain || '',
                timezone: project.timezone,
                retentionDays: project.retentionDays,
              }}
            />
          </CardContent>
        </Card>

        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isOwner && (
              <SettingsForm
                type="delete"
                projectId={project.id}
                projectName={project.name}
              />
            )}
            <div className={isOwner ? 'border-t border-destructive/30 pt-4' : ''}>
              <DeleteAccountForm email={user.email} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
