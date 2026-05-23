'use server';

import { db, goals } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

export async function createGoal(formData: FormData) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const projectId = formData.get('projectId') as string;
  const name = formData.get('name') as string;
  const type = formData.get('type') as 'event' | 'pageview';
  const eventName = formData.get('eventName') as string | null;
  const pagePathPattern = formData.get('pagePathPattern') as string | null;
  const value = formData.get('value') as string | null;

  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) {
    throw new Error('Project not found');
  }

  await db.insert(goals).values({
    projectId,
    name,
    type,
    eventName: type === 'event' ? eventName : null,
    pagePathPattern: type === 'pageview' ? pagePathPattern : null,
    value: value !== null && value !== '' ? value : null,
  });

  revalidatePath('/dashboard/goals');
}

export async function deleteGoal(goalId: string) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const goal = await db.query.goals.findFirst({
    where: eq(goals.id, goalId),
  });
  if (!goal) {
    throw new Error('Goal not found');
  }
  const role = await requireRole(session.userId, goal.projectId, 'editor');
  if (!role) {
    throw new Error('Goal not found');
  }

  await db.delete(goals).where(eq(goals.id, goalId));
  revalidatePath('/dashboard/goals');
}
