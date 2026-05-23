'use server';

import { db, segments } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

export async function createSegment(formData: FormData) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const projectId = formData.get('projectId') as string;
  const name = formData.get('name') as string;
  const filtersRaw = formData.get('filters') as string;

  let filters;
  try {
    filters = JSON.parse(filtersRaw);
  } catch {
    throw new Error('Invalid filter configuration');
  }

  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) {
    throw new Error('Project not found');
  }

  await db.insert(segments).values({
    projectId,
    name,
    filters,
  });

  revalidatePath('/dashboard/segments');
}

export async function deleteSegment(segmentId: string) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const segment = await db.query.segments.findFirst({
    where: eq(segments.id, segmentId),
  });
  if (!segment) {
    throw new Error('Segment not found');
  }
  const role = await requireRole(session.userId, segment.projectId, 'editor');
  if (!role) {
    throw new Error('Segment not found');
  }

  await db.delete(segments).where(eq(segments.id, segmentId));
  revalidatePath('/dashboard/segments');
}
