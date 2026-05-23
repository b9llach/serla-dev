import { db, auditLog } from '@/lib/db';

interface LogParams {
  projectId: string | null;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append a row to audit_log. Fire-and-forget: a failure here should never
 * break the action that produced the event - so the caller can ignore the
 * return value. We swallow errors and log them; the event is non-critical.
 */
export async function logAudit(params: LogParams): Promise<void> {
  try {
    await db.insert(auditLog).values({
      projectId: params.projectId,
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error('[audit-log] failed to write entry', { action: params.action }, err);
  }
}
