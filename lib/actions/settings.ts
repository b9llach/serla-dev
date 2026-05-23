'use server';

import { db, projects, users } from '@/lib/db';
import { getSession, clearSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { logAudit } from '@/lib/utils/audit-log';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq, and, isNull } from 'drizzle-orm';

export async function updateUser(formData: FormData) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const name = formData.get('name') as string;
  // The form uses a real <input type="checkbox"> - present-and-on means 'on'.
  const weeklyDigestEnabled = formData.get('weeklyDigestEnabled') === 'on';

  await db.update(users)
    .set({
      name,
      weeklyDigestEnabled,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.userId));

  revalidatePath('/dashboard/settings');
}

// Maximum retention days by plan
const MAX_RETENTION_BY_PLAN: Record<string, number> = {
  free: 7,
  hobby: 90,
  pro: 365,
  max: 1095,
};

export async function updateProject(formData: FormData) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const projectId = formData.get('projectId') as string;
  const name = formData.get('name') as string;
  const domain = formData.get('domain') as string | null;
  const timezone = formData.get('timezone') as string;
  let retentionDays = parseInt(formData.get('retentionDays') as string);

  // Editors and owners can edit project settings.
  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) {
    throw new Error('Project not found');
  }

  // Confirm the project still exists (and isn't soft-deleted) before update.
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      isNull(projects.deletedAt)
    ),
  });
  if (!project) {
    throw new Error('Project not found');
  }

  // Get user plan to validate retention
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, session.userId), isNull(users.deletedAt)),
    columns: { plan: true },
  });

  const userPlan = user?.plan || 'free';
  const maxRetention = MAX_RETENTION_BY_PLAN[userPlan] || MAX_RETENTION_BY_PLAN.free;

  // Clamp retention days to plan limit
  if (retentionDays > maxRetention) {
    retentionDays = maxRetention;
  }

  // Ensure minimum retention of 7 days
  if (retentionDays < 7) {
    retentionDays = 7;
  }

  await db.update(projects)
    .set({
      name,
      domain: domain || null,
      timezone,
      retentionDays,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  revalidatePath('/dashboard/settings');
}

export async function deleteProject(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const projectId = formData.get('projectId') as string;

  // Only owners can delete the project.
  const role = await requireRole(session.userId, projectId, 'owner');
  if (!role) {
    return { success: false, error: 'Project not found' };
  }

  // Confirm the project still exists (and isn't already soft-deleted).
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      isNull(projects.deletedAt)
    ),
  });
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  await db.update(projects)
    .set({ deletedAt: new Date() })
    .where(eq(projects.id, projectId));

  await logAudit({
    projectId,
    actorId: session.userId,
    action: 'project.deleted',
    targetType: 'project',
    targetId: projectId,
    metadata: { name: project.name },
  });

  // Clear the selected project cookie so it doesn't point to a deleted project.
  // The client will navigate after we return - we don't call redirect() here
  // because Next.js implements redirect() by throwing, and any client-side
  // try/catch would misread it as a failure.
  const cookieStore = await cookies();
  cookieStore.delete('serla:project');

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');

  return { success: true };
}

/**
 * Change the signed-in user's password. Requires the current password as a
 * challenge - we never let a stolen session change credentials silently.
 */
export async function changePassword(
  prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;

  if (!currentPassword || !newPassword) {
    return { error: 'Both current and new passwords are required' };
  }
  if (newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters' };
  }
  if (currentPassword === newPassword) {
    return { error: 'New password must differ from current password' };
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, session.userId), isNull(users.deletedAt)),
  });
  if (!user) return { error: 'Account not found' };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { error: 'Current password is incorrect' };

  const newHash = await hashPassword(newPassword);
  await db.update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, session.userId));

  return { success: true };
}

/**
 * Self-service account deletion. Soft-deletes the user (cascades to projects
 * via getCurrentProject filter), clears the session, and redirects home.
 * The daily cron hard-deletes the row after 30 days.
 */
export async function deleteOwnAccount(formData: FormData): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  // Require the user to type their email as a final confirmation step.
  const confirmation = formData.get('confirmation') as string;
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, session.userId), isNull(users.deletedAt)),
  });
  if (!user) return { error: 'Account not found' };

  if (confirmation !== user.email) {
    return { error: 'Confirmation does not match your email' };
  }

  // Require current-password challenge so a stolen session cannot delete.
  const password = formData.get('password') as string;
  if (!password) return { error: 'Password required' };
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { error: 'Password is incorrect' };

  await db.update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, session.userId));

  await clearSession();
  const cookieStore = await cookies();
  cookieStore.delete('serla:project');

  redirect('/');
}
