'use server';

import { db, customMetrics } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

export async function createMetric(formData: FormData) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const projectId = formData.get('projectId') as string;
  const name = formData.get('name') as string;
  const description = formData.get('description') as string | null;
  const aggregation = formData.get('aggregation') as string;
  const eventName = formData.get('eventName') as string;
  const property = formData.get('property') as string | null;

  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) {
    throw new Error('Project not found');
  }

  await db.insert(customMetrics).values({
    projectId,
    name,
    description,
    aggregation,
    eventName,
    property,
  });

  revalidatePath('/dashboard/metrics');
}

export async function deleteMetric(metricId: string) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const metric = await db.query.customMetrics.findFirst({
    where: eq(customMetrics.id, metricId),
  });
  if (!metric) {
    throw new Error('Metric not found');
  }
  const role = await requireRole(session.userId, metric.projectId, 'editor');
  if (!role) {
    throw new Error('Metric not found');
  }

  await db.delete(customMetrics).where(eq(customMetrics.id, metricId));
  revalidatePath('/dashboard/metrics');
}
