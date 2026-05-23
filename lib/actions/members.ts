'use server';

import {
  db,
  projects,
  projectMembers,
  projectInvites,
  users,
} from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import {
  requireRole,
  getProjectMembership,
  type ProjectRole,
} from '@/lib/utils/project';
import { sendEmail } from '@/lib/email';
import { logAudit } from '@/lib/utils/audit-log';
import { revalidatePath } from 'next/cache';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import crypto from 'crypto';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Generate a secure random plaintext token (same as password-reset/email-verification).
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Hash the token for storage - we never store the raw token.
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Owner-only: create a project_invites row with a hashed token and email the
 * recipient a link to /auth/accept-invite?token={plaintext}.
 *
 * Rejects:
 *  - non-owner callers
 *  - empty/invalid email
 *  - role other than 'editor' | 'viewer'
 *  - email already a member of this project
 *  - unexpired, un-accepted invite already exists for the same email+project
 */
export async function inviteMember(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const projectId = String(formData.get('projectId') || '');
  const emailRaw = String(formData.get('email') || '').trim().toLowerCase();
  const role = String(formData.get('role') || '') as ProjectRole;

  if (!projectId) {
    return { success: false, error: 'Project not found' };
  }
  if (!emailRaw || !isValidEmail(emailRaw)) {
    return { success: false, error: 'A valid email is required' };
  }
  if (role !== 'editor' && role !== 'viewer') {
    return { success: false, error: 'Invite role must be editor or viewer' };
  }

  // Owner-only check. Treating "not authorized" as "not found" to avoid
  // leaking project existence to non-members.
  const callerRole = await requireRole(session.userId, projectId, 'owner');
  if (!callerRole) {
    return { success: false, error: 'Project not found' };
  }

  // Look up the project name + inviter info for the email body.
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const inviter = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  // Reject if the invited email is already a member of this project.
  const existingMember = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(users.email, emailRaw)
      )
    )
    .limit(1);
  if (existingMember.length > 0) {
    return { success: false, error: 'That email is already a member of this project' };
  }

  // Reject if there's an un-accepted, un-expired invite for the same email.
  const now = new Date();
  const existingInvite = await db.query.projectInvites.findFirst({
    where: and(
      eq(projectInvites.projectId, projectId),
      eq(projectInvites.email, emailRaw),
      isNull(projectInvites.acceptedAt),
      gt(projectInvites.expiresAt, now)
    ),
  });
  if (existingInvite) {
    return {
      success: false,
      error: 'A pending invite already exists for that email. Revoke it first to send a new one.',
    };
  }

  // Token: plaintext goes in the email, hash goes in the DB.
  const token = generateToken();
  const tokenHash = hashToken(token);

  // Invite expires in 7 days.
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.insert(projectInvites).values({
    projectId,
    email: emailRaw,
    role,
    tokenHash,
    invitedBy: session.userId,
    expiresAt,
  });

  // Best-effort email send. We don't fail the action if the email provider is
  // down - the row exists and the owner can still revoke + reinvite.
  const acceptUrl = `${APP_URL}/auth/accept-invite?token=${token}`;
  const inviterDisplay = inviter?.name || inviter?.email || 'A team member';
  await sendEmail({
    to: emailRaw,
    subject: `You've been invited to ${project.name} on Serla`,
    text: `
${inviterDisplay} invited you to join ${project.name} as a ${role}.

Accept the invite:
${acceptUrl}

This invite expires in 7 days.
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #09090b; color: #ffffff; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: 500; margin-bottom: 24px; color: #ffffff;">You've been invited</h1>
    <p style="color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">
      ${escapeHtml(inviterDisplay)} invited you to join <strong style="color: #ffffff;">${escapeHtml(project.name)}</strong> on Serla as a <strong style="color: #ffffff;">${role}</strong>.
    </p>
    <a href="${acceptUrl}" style="display: inline-block; background-color: #ffffff; color: #09090b; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-bottom: 24px;">
      Accept invite
    </a>
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin-top: 24px;">
      This invite expires in 7 days.
    </p>
    <p style="color: #71717a; font-size: 14px; line-height: 1.6;">
      If you weren't expecting this, you can ignore this email.
    </p>
    <hr style="border: none; border-top: 1px solid #27272a; margin: 32px 0;">
    <p style="color: #52525b; font-size: 12px;">
      Serla - Privacy-focused analytics
    </p>
  </div>
</body>
</html>
    `.trim(),
  });

  await logAudit({
    projectId,
    actorId: session.userId,
    action: 'member.invited',
    targetType: 'email',
    targetId: emailRaw,
    metadata: { role },
  });

  revalidatePath('/dashboard/settings/team');
  return { success: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Any authenticated user can call. Verifies the token, that it's not expired,
 * and hasn't already been accepted. Atomically claims the invite in a single
 * UPDATE (matching the password-reset / email-verification pattern) and then
 * inserts a project_members row.
 *
 * If REQUIRE_EMAIL_VERIFICATION is on, the accepting user must have a verified
 * email. The user's email must also match the invite's email - invites are
 * targeted to a specific address.
 */
export async function acceptInvite(
  token: string
): Promise<{ success: boolean; projectId?: string; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'You must be signed in to accept an invite' };
  }

  if (!token || typeof token !== 'string') {
    return { success: false, error: 'Invalid invite link' };
  }

  // Need the user's email + verification status to validate the invite.
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  if (!user) {
    return { success: false, error: 'Account not found' };
  }

  if (
    process.env.REQUIRE_EMAIL_VERIFICATION === 'true' &&
    !user.emailVerifiedAt
  ) {
    return {
      success: false,
      error: 'Please verify your email address before accepting an invite.',
    };
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  // Pre-check the invite's email matches the signed-in user before the atomic
  // claim. We do this with a non-claiming SELECT so a wrong-account attempt
  // doesn't burn the invite (the claim itself is still race-safe via UPDATE
  // ... WHERE accepted_at IS NULL below).
  const preview = await db.query.projectInvites.findFirst({
    where: and(
      eq(projectInvites.tokenHash, tokenHash),
      gt(projectInvites.expiresAt, now),
      isNull(projectInvites.acceptedAt)
    ),
  });
  if (!preview) {
    return {
      success: false,
      error: 'This invite link is invalid, expired, or already used.',
    };
  }
  if (preview.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      success: false,
      error: 'This invite was sent to a different email address. Sign in with that account to accept.',
    };
  }

  // Atomic claim: a single UPDATE marks the invite accepted. The WHERE clause
  // ensures it can only be claimed once and only if not expired. Race-safe
  // against concurrent acceptance attempts.
  const claimed = await db
    .update(projectInvites)
    .set({ acceptedAt: now })
    .where(
      and(
        eq(projectInvites.tokenHash, tokenHash),
        gt(projectInvites.expiresAt, now),
        isNull(projectInvites.acceptedAt)
      )
    )
    .returning({
      id: projectInvites.id,
      projectId: projectInvites.projectId,
      email: projectInvites.email,
      role: projectInvites.role,
      invitedBy: projectInvites.invitedBy,
    });

  if (claimed.length === 0) {
    // Someone else accepted it in the gap between our pre-check and claim.
    return {
      success: false,
      error: 'This invite link is invalid, expired, or already used.',
    };
  }

  const invite = claimed[0];

  // If the user is somehow already a member (e.g. owner re-invited an existing
  // editor), don't insert a duplicate row. The unique index would 500.
  const existing = await getProjectMembership(user.id, invite.projectId);
  if (existing) {
    revalidatePath('/dashboard/settings/team');
    return { success: true, projectId: invite.projectId };
  }

  await db.insert(projectMembers).values({
    projectId: invite.projectId,
    userId: user.id,
    role: invite.role,
    invitedBy: invite.invitedBy,
  });

  await logAudit({
    projectId: invite.projectId,
    actorId: user.id,
    action: 'member.joined',
    targetType: 'user',
    targetId: user.id,
    metadata: { role: invite.role, viaInvite: true },
  });

  revalidatePath('/dashboard/settings/team');
  return { success: true, projectId: invite.projectId };
}

/**
 * Owner-only: remove another member from the project. Cannot:
 *  - remove yourself (use leaveProject - not implemented here yet)
 *  - remove the last owner (would leave the project orphaned)
 */
export async function removeMember(
  projectId: string,
  userIdToRemove: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const callerRole = await requireRole(session.userId, projectId, 'owner');
  if (!callerRole) {
    return { success: false, error: 'Project not found' };
  }

  if (userIdToRemove === session.userId) {
    return {
      success: false,
      error: 'You cannot remove yourself. Use "Leave project" instead.',
    };
  }

  // Find the target membership.
  const target = await db.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userIdToRemove)
    ),
  });
  if (!target) {
    return { success: false, error: 'Member not found' };
  }

  // Refuse to remove the last owner. Counting "other owners besides this one".
  if (target.role === 'owner') {
    const ownerCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.role, 'owner')
        )
      );
    const total = Number(ownerCount[0]?.count || 0);
    if (total <= 1) {
      return { success: false, error: 'Cannot remove the last owner' };
    }
  }

  await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userIdToRemove)
      )
    );

  await logAudit({
    projectId,
    actorId: session.userId,
    action: 'member.removed',
    targetType: 'user',
    targetId: userIdToRemove,
    metadata: { role: target.role },
  });

  revalidatePath('/dashboard/settings/team');
  return { success: true };
}

/**
 * Owner-only: change a member's role. Refuses to demote the last owner.
 */
export async function changeRole(
  projectId: string,
  userIdToChange: string,
  newRole: ProjectRole
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  if (newRole !== 'owner' && newRole !== 'editor' && newRole !== 'viewer') {
    return { success: false, error: 'Invalid role' };
  }

  const callerRole = await requireRole(session.userId, projectId, 'owner');
  if (!callerRole) {
    return { success: false, error: 'Project not found' };
  }

  const target = await db.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userIdToChange)
    ),
  });
  if (!target) {
    return { success: false, error: 'Member not found' };
  }

  if (target.role === newRole) {
    return { success: true };
  }

  // If demoting an owner, ensure we're not the last one.
  if (target.role === 'owner' && newRole !== 'owner') {
    const ownerCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.role, 'owner')
        )
      );
    const total = Number(ownerCount[0]?.count || 0);
    if (total <= 1) {
      return { success: false, error: 'Cannot demote the last owner' };
    }
  }

  await db
    .update(projectMembers)
    .set({ role: newRole })
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userIdToChange)
      )
    );

  await logAudit({
    projectId,
    actorId: session.userId,
    action: 'member.role_changed',
    targetType: 'user',
    targetId: userIdToChange,
    metadata: { from: target.role, to: newRole },
  });

  revalidatePath('/dashboard/settings/team');
  return { success: true };
}

/**
 * Owner-only: delete a pending invite row. Safe to call on already-accepted
 * rows too, but those are filtered out of the UI list.
 */
export async function revokeInvite(
  inviteId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // Resolve the invite first so we can authorize against its project.
  const invite = await db.query.projectInvites.findFirst({
    where: eq(projectInvites.id, inviteId),
  });
  if (!invite) {
    return { success: false, error: 'Invite not found' };
  }

  const callerRole = await requireRole(session.userId, invite.projectId, 'owner');
  if (!callerRole) {
    // Same opacity as the other actions: don't leak project existence.
    return { success: false, error: 'Invite not found' };
  }

  await db.delete(projectInvites).where(eq(projectInvites.id, inviteId));

  await logAudit({
    projectId: invite.projectId,
    actorId: session.userId,
    action: 'invite.revoked',
    targetType: 'email',
    targetId: invite.email,
    metadata: { role: invite.role },
  });

  revalidatePath('/dashboard/settings/team');
  return { success: true };
}
