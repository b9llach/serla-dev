'use server';

import { db, errorGroups } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { logAudit } from '@/lib/utils/audit-log';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

type Status = 'unresolved' | 'resolved' | 'ignored';

async function setStatus(
  groupId: string,
  status: Status,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const group = await db.query.errorGroups.findFirst({
    where: eq(errorGroups.id, groupId),
  });
  if (!group) return { success: false, error: 'Error group not found' };

  const role = await requireRole(session.userId, group.projectId, 'editor');
  if (!role) return { success: false, error: 'Error group not found' };

  await db
    .update(errorGroups)
    .set({
      status,
      resolvedAt: status === 'resolved' ? new Date() : null,
      resolvedBy: status === 'resolved' ? session.userId : null,
    })
    .where(eq(errorGroups.id, groupId));

  await logAudit({
    projectId: group.projectId,
    actorId: session.userId,
    action: `error.${status}`,
    targetType: 'error_group',
    targetId: groupId,
    metadata: { fingerprint: group.fingerprint, message: group.message },
  });

  revalidatePath('/dashboard/errors');
  revalidatePath(`/dashboard/errors/${groupId}`);
  return { success: true };
}

export async function resolveError(groupId: string) {
  return setStatus(groupId, 'resolved');
}
export async function ignoreError(groupId: string) {
  return setStatus(groupId, 'ignored');
}
export async function reopenError(groupId: string) {
  return setStatus(groupId, 'unresolved');
}
