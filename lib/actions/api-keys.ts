'use server';

import { db, apiKeys } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { generateApiKey } from '@/lib/api/auth';
import { logAudit } from '@/lib/utils/audit-log';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

/**
 * Create a new API key for the given project. Returns the plaintext key once
 * so the caller can copy it; subsequent reads only ever see the prefix.
 */
export async function createApiKey(
  projectId: string,
  name: string,
): Promise<{ success: boolean; key?: string; prefix?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) return { success: false, error: 'Project not found' };

  const trimmed = (name ?? '').trim();
  if (!trimmed) return { success: false, error: 'Key name is required' };
  if (trimmed.length > 100) {
    return { success: false, error: 'Key name must be 100 characters or fewer' };
  }

  const { key, hash, prefix } = generateApiKey();
  const keyHash = await hash;

  await db.insert(apiKeys).values({
    projectId,
    name: trimmed,
    keyHash,
    keyPrefix: prefix,
    createdBy: session.userId,
  });

  await logAudit({
    projectId,
    actorId: session.userId,
    action: 'api_key.created',
    targetType: 'api_key',
    metadata: { name: trimmed, keyPrefix: prefix },
  });

  revalidatePath('/dashboard/settings/api-keys');
  return { success: true, key, prefix };
}

/**
 * Soft-revoke a key. Auth path rejects revoked keys immediately. The row
 * stays for the audit trail.
 */
export async function revokeApiKey(
  keyId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const existing = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, keyId),
  });
  if (!existing) return { success: false, error: 'API key not found' };

  const role = await requireRole(session.userId, existing.projectId, 'editor');
  if (!role) return { success: false, error: 'API key not found' };

  if (existing.revokedAt) {
    return { success: false, error: 'API key is already revoked' };
  }

  await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), revokedBy: session.userId })
    .where(eq(apiKeys.id, keyId));

  await logAudit({
    projectId: existing.projectId,
    actorId: session.userId,
    action: 'api_key.revoked',
    targetType: 'api_key',
    targetId: keyId,
    metadata: { name: existing.name, keyPrefix: existing.keyPrefix },
  });

  revalidatePath('/dashboard/settings/api-keys');
  return { success: true };
}

/**
 * Rename a key. Useful when an org reorganizes ("staging" -> "prod") and the
 * key reference in dashboards/logs should update along with it.
 */
export async function renameApiKey(
  keyId: string,
  newName: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const existing = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, keyId),
  });
  if (!existing) return { success: false, error: 'API key not found' };

  const role = await requireRole(session.userId, existing.projectId, 'editor');
  if (!role) return { success: false, error: 'API key not found' };

  const trimmed = (newName ?? '').trim();
  if (!trimmed) return { success: false, error: 'Key name is required' };
  if (trimmed.length > 100) {
    return { success: false, error: 'Key name must be 100 characters or fewer' };
  }

  await db
    .update(apiKeys)
    .set({ name: trimmed })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.projectId, existing.projectId)));

  revalidatePath('/dashboard/settings/api-keys');
  return { success: true };
}
