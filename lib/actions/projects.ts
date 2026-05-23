'use server';

import { db, projects, projectMembers } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'serla:project';

export async function switchProject(projectId: string): Promise<{ success: boolean }> {
  const session = await getSession();
  if (!session) {
    return { success: false };
  }

  // Any membership (viewer or higher) is sufficient to select this project
  // as the active dashboard context.
  const role = await requireRole(session.userId, projectId, 'viewer');
  if (!role) {
    return { success: false };
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, projectId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  revalidatePath('/dashboard');
  return { success: true };
}

export async function createProject(formData: FormData): Promise<{ success: boolean; projectId?: string; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const name = formData.get('name') as string;
  const domain = formData.get('domain') as string | null;

  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Project name is required' };
  }

  // No API key is generated here. Users explicitly create keys from
  // /dashboard/settings/api-keys after the project exists.
  const [newProject] = await db.insert(projects).values({
    userId: session.userId,
    name: name.trim(),
    domain: domain?.trim() || null,
    retentionDays: 7,
  }).returning({ id: projects.id });

  // The creator joins the project as the owner. All authorization checks
  // go through project_members now (projects.userId is just a stale FK).
  await db.insert(projectMembers).values({
    projectId: newProject.id,
    userId: session.userId,
    role: 'owner',
  });

  // Set cookie to switch to the new project
  const cookieStore = await cookies();
  try {
    cookieStore.set(COOKIE_NAME, newProject.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch (err) {
    console.error('Failed to set project cookie after creation:', err);
    // Project is still created; user will see it in the dropdown on next page load.
  }

  revalidatePath('/dashboard');

  return {
    success: true,
    projectId: newProject.id,
  };
}
