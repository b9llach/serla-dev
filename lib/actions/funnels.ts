'use server';

import { db, funnels } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

export async function createFunnel(formData: FormData) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const projectId = formData.get('projectId') as string;
  const name = formData.get('name') as string;
  const windowDays = parseInt(formData.get('windowDays') as string) || 7;
  const steps = JSON.parse(formData.get('steps') as string);

  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) {
    throw new Error('Project not found');
  }

  await db.insert(funnels).values({
    projectId,
    name,
    steps,
    windowDays,
  });

  revalidatePath('/dashboard/funnels');
}

export async function deleteFunnel(funnelId: string) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const funnel = await db.query.funnels.findFirst({
    where: eq(funnels.id, funnelId),
  });
  if (!funnel) {
    throw new Error('Funnel not found');
  }
  const role = await requireRole(session.userId, funnel.projectId, 'editor');
  if (!role) {
    throw new Error('Funnel not found');
  }

  await db.delete(funnels).where(eq(funnels.id, funnelId));
  revalidatePath('/dashboard/funnels');
}
