'use server';

import { db, featureFlags } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/utils/project';
import { logAudit } from '@/lib/utils/audit-log';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

interface VariantInput {
  key: string;
  weight: number;
}

interface ConditionInput {
  /** 'distinct_id_in' | 'property_equals' */
  type: string;
  /** for distinct_id_in: array of ids; for property_equals: property name */
  field?: string;
  /** for property_equals: value to match */
  value?: string | number | boolean;
  /** for distinct_id_in: list of distinct ids */
  values?: string[];
}

function parseVariants(raw: string | undefined | null): VariantInput[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v: unknown): v is VariantInput => {
        return !!v && typeof v === 'object' && 'key' in v && 'weight' in v;
      })
      .map(v => ({ key: String(v.key), weight: Number(v.weight) }))
      // Drop non-finite or negative weights here rather than letting them
      // through. A NaN weight would otherwise defeat the sum-to-100 check
      // below (every NaN comparison is false), get stored as JSON null, and
      // silently route 100% of traffic to the last variant.
      .filter(v => Number.isFinite(v.weight) && v.weight >= 0 && v.key.length > 0);
  } catch {
    return [];
  }
}

function parseConditions(raw: string | undefined | null): ConditionInput[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function validateKey(key: string): string | null {
  if (!key) return 'Key is required';
  if (key.length > 100) return 'Key must be 100 characters or fewer';
  if (!/^[a-z0-9_-]+$/i.test(key)) {
    return 'Key may only contain letters, numbers, hyphens, and underscores';
  }
  return null;
}

export async function createFlag(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const projectId = formData.get('projectId') as string;
  const role = await requireRole(session.userId, projectId, 'editor');
  if (!role) return { success: false, error: 'Project not found' };

  const key = ((formData.get('key') as string) || '').trim();
  const name = ((formData.get('name') as string) || '').trim();
  const description = ((formData.get('description') as string) || '').trim() || null;
  const enabled = formData.get('enabled') === 'on';
  const rolloutPercentageRaw = Number(formData.get('rolloutPercentage') ?? 100);
  const rolloutPercentage = Math.max(0, Math.min(100, Math.round(rolloutPercentageRaw)));
  const variants = parseVariants(formData.get('variants') as string | null);
  const conditions = parseConditions(formData.get('conditions') as string | null);

  const keyError = validateKey(key);
  if (keyError) return { success: false, error: keyError };
  if (!name) return { success: false, error: 'Name is required' };

  // Validate variants if provided: weights must sum to 100.
  if (variants.length > 0) {
    const totalWeight = variants.reduce((s, v) => s + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      return { success: false, error: 'Variant weights must sum to 100' };
    }
    if (new Set(variants.map(v => v.key)).size !== variants.length) {
      return { success: false, error: 'Variant keys must be unique' };
    }
  }

  // Uniqueness check, scoped to this project. Keys are only unique per
  // project, so querying by key alone could return another tenant's row and
  // let this check pass, turning a clear error into a unique-index violation.
  const existing = await db.query.featureFlags.findFirst({
    where: and(eq(featureFlags.projectId, projectId), eq(featureFlags.key, key)),
  });
  if (existing) {
    return { success: false, error: 'A flag with that key already exists' };
  }

  try {
    const inserted = await db
      .insert(featureFlags)
      .values({
        projectId,
        key,
        name,
        description,
        enabled,
        rolloutPercentage,
        conditions,
        variants,
        createdBy: session.userId,
      })
      .returning({ id: featureFlags.id });

    await logAudit({
      projectId,
      actorId: session.userId,
      action: 'flag.created',
      targetType: 'flag',
      targetId: inserted[0]?.id,
      metadata: { key, name },
    });

    revalidatePath('/dashboard/flags');
    return { success: true };
  } catch (error) {
    console.error('[flags] create error:', error);
    return { success: false, error: 'Failed to create flag' };
  }
}

export async function updateFlag(
  flagId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const existing = await db.query.featureFlags.findFirst({
    where: eq(featureFlags.id, flagId),
  });
  if (!existing) return { success: false, error: 'Flag not found' };

  const role = await requireRole(session.userId, existing.projectId, 'editor');
  if (!role) return { success: false, error: 'Flag not found' };

  const name = ((formData.get('name') as string) || existing.name).trim();
  const description = ((formData.get('description') as string) || '').trim() || null;
  const enabled = formData.get('enabled') === 'on';
  const rolloutPercentageRaw = Number(formData.get('rolloutPercentage') ?? existing.rolloutPercentage);
  const rolloutPercentage = Math.max(0, Math.min(100, Math.round(rolloutPercentageRaw)));
  // Treat an absent field as "leave unchanged" rather than "set to empty".
  // The dashboard dialog does not yet expose a conditions editor, so without
  // this guard every UI edit (even just flipping the toggle) would silently
  // wipe targeting rules set via the API.
  const variants = formData.has('variants')
    ? parseVariants(formData.get('variants') as string | null)
    : ((existing.variants as VariantInput[]) ?? []);
  const conditions = formData.has('conditions')
    ? parseConditions(formData.get('conditions') as string | null)
    : ((existing.conditions as ConditionInput[]) ?? []);

  if (!name) return { success: false, error: 'Name is required' };
  if (variants.length > 0) {
    const totalWeight = variants.reduce((s, v) => s + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      return { success: false, error: 'Variant weights must sum to 100' };
    }
    if (new Set(variants.map(v => v.key)).size !== variants.length) {
      return { success: false, error: 'Variant keys must be unique' };
    }
  }

  await db
    .update(featureFlags)
    .set({
      name,
      description,
      enabled,
      rolloutPercentage,
      conditions,
      variants,
      updatedAt: new Date(),
    })
    .where(eq(featureFlags.id, flagId));

  await logAudit({
    projectId: existing.projectId,
    actorId: session.userId,
    action: 'flag.updated',
    targetType: 'flag',
    targetId: flagId,
    metadata: { key: existing.key },
  });

  revalidatePath('/dashboard/flags');
  return { success: true };
}

export async function toggleFlag(flagId: string): Promise<{ success: boolean }> {
  const session = await getSession();
  if (!session) return { success: false };

  const flag = await db.query.featureFlags.findFirst({
    where: eq(featureFlags.id, flagId),
  });
  if (!flag) return { success: false };

  const role = await requireRole(session.userId, flag.projectId, 'editor');
  if (!role) return { success: false };

  await db
    .update(featureFlags)
    .set({ enabled: !flag.enabled, updatedAt: new Date() })
    .where(eq(featureFlags.id, flagId));

  await logAudit({
    projectId: flag.projectId,
    actorId: session.userId,
    action: flag.enabled ? 'flag.disabled' : 'flag.enabled',
    targetType: 'flag',
    targetId: flagId,
    metadata: { key: flag.key },
  });

  revalidatePath('/dashboard/flags');
  return { success: true };
}

export async function deleteFlag(flagId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const flag = await db.query.featureFlags.findFirst({
    where: eq(featureFlags.id, flagId),
  });
  if (!flag) return;

  const role = await requireRole(session.userId, flag.projectId, 'editor');
  if (!role) return;

  await db.delete(featureFlags).where(eq(featureFlags.id, flagId));

  await logAudit({
    projectId: flag.projectId,
    actorId: session.userId,
    action: 'flag.deleted',
    targetType: 'flag',
    targetId: flagId,
    metadata: { key: flag.key },
  });

  revalidatePath('/dashboard/flags');
}
