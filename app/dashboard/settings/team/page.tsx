import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import {
  db,
  projects,
  projectMembers,
  projectInvites,
  users,
  auditLog,
} from '@/lib/db';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { getCurrentProjectWithRole, type ProjectRole } from '@/lib/utils/project';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, Clock } from 'lucide-react';
import { InviteForm } from '@/components/dashboard/invite-form';
import {
  MemberActions,
  RevokeInviteButton,
} from '@/components/dashboard/member-actions';

export const metadata: Metadata = {
  title: 'Team',
};

interface MemberRow {
  userId: string;
  email: string;
  name: string | null;
  role: ProjectRole;
  joinedAt: Date;
}

interface InviteRow {
  id: string;
  email: string;
  role: ProjectRole;
  inviterEmail: string | null;
  inviterName: string | null;
  expiresAt: Date;
  createdAt: Date;
}

async function getMembers(projectId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      userId: projectMembers.userId,
      role: projectMembers.role,
      joinedAt: projectMembers.joinedAt,
      email: users.email,
      name: users.name,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        isNull(users.deletedAt)
      )
    )
    .orderBy(asc(projectMembers.joinedAt));

  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name,
    role: r.role as ProjectRole,
    joinedAt: r.joinedAt,
  }));
}

async function getPendingInvites(projectId: string): Promise<InviteRow[]> {
  const now = new Date();
  const rows = await db
    .select({
      id: projectInvites.id,
      email: projectInvites.email,
      role: projectInvites.role,
      expiresAt: projectInvites.expiresAt,
      createdAt: projectInvites.createdAt,
      inviterEmail: users.email,
      inviterName: users.name,
    })
    .from(projectInvites)
    .leftJoin(users, eq(users.id, projectInvites.invitedBy))
    .where(
      and(
        eq(projectInvites.projectId, projectId),
        isNull(projectInvites.acceptedAt),
        gt(projectInvites.expiresAt, now)
      )
    )
    .orderBy(asc(projectInvites.createdAt));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as ProjectRole,
    inviterEmail: r.inviterEmail,
    inviterName: r.inviterName,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

interface AuditRow {
  id: string;
  action: string;
  actorEmail: string | null;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

async function getAuditEntries(projectId: string): Promise<AuditRow[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorEmail: users.email,
      actorName: users.name,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(eq(auditLog.projectId, projectId))
    .orderBy(desc(auditLog.createdAt))
    .limit(50);

  return rows.map(r => ({
    id: r.id,
    action: r.action,
    actorEmail: r.actorEmail,
    actorName: r.actorName,
    targetType: r.targetType,
    targetId: r.targetId,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
  }));
}

function describeAuditEntry(entry: AuditRow): string {
  const actor = entry.actorName || entry.actorEmail || 'Someone';
  const meta = entry.metadata;
  switch (entry.action) {
    case 'member.invited':
      return `${actor} invited ${entry.targetId} as ${meta.role ?? 'member'}`;
    case 'member.joined':
      return `${actor} joined as ${meta.role ?? 'member'}`;
    case 'member.removed':
      return `${actor} removed a ${meta.role ?? 'member'}`;
    case 'member.role_changed':
      return `${actor} changed a member's role from ${meta.from} to ${meta.to}`;
    case 'invite.revoked':
      return `${actor} revoked the invite for ${entry.targetId}`;
    case 'project.deleted':
      return `${actor} deleted the project`;
    default:
      return `${actor}: ${entry.action}`;
  }
}

function formatRelativePast(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / (1000 * 60));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

function roleBadgeVariant(role: ProjectRole): 'default' | 'secondary' | 'outline' {
  if (role === 'owner') return 'default';
  if (role === 'editor') return 'secondary';
  return 'outline';
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeFuture(d: Date): string {
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days >= 2) return `in ${days} days`;
  const hours = Math.ceil(ms / (1000 * 60 * 60));
  if (hours >= 2) return `in ${hours} hours`;
  return 'in under an hour';
}

export default async function TeamPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const current = await getCurrentProjectWithRole(session.userId);

  if (!current) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Team</h1>
            <p className="text-muted-foreground">
              Manage who has access to your project
            </p>
          </div>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No project selected. Create a project first.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { project, role: currentRole } = current;
  const isOwner = currentRole === 'owner';

  const [members, pendingInvites, auditEntries] = await Promise.all([
    getMembers(project.id),
    isOwner ? getPendingInvites(project.id) : Promise.resolve([] as InviteRow[]),
    isOwner ? getAuditEntries(project.id) : Promise.resolve([] as AuditRow[]),
  ]);

  // Count owners to decide whether the lone owner row is locked.
  const ownerCount = members.filter((m) => m.role === 'owner').length;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground">
            Manage who has access to {project.name}
          </p>
        </div>

        {isOwner && (
          <Card>
            <CardHeader>
              <CardTitle>Invite member</CardTitle>
              <CardDescription>
                Send an invite by email. The invite expires in 7 days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviteForm projectId={project.id} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Members ({members.length})</CardTitle>
            <CardDescription>
              Everyone with access to {project.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No members yet.
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((m) => {
                  const isSelf = m.userId === session.userId;
                  const isLastOwner = m.role === 'owner' && ownerCount <= 1;
                  // Owners can change roles on anyone except themselves and
                  // can't demote the last owner. They can remove anyone but
                  // themselves and the last owner.
                  const canChangeRole =
                    isOwner && !isSelf && !(isLastOwner && m.role === 'owner');
                  const canRemove = isOwner && !isSelf && !isLastOwner;

                  return (
                    <div
                      key={m.userId}
                      className="flex flex-col gap-3 rounded-lg bg-[#0a0a0a] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-100 truncate">
                            {m.name || m.email}
                          </span>
                          {isSelf && (
                            <Badge variant="outline" className="text-[10px]">
                              You
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Joined {formatDate(m.joinedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {isOwner ? (
                          <MemberActions
                            projectId={project.id}
                            memberId={m.userId}
                            memberEmail={m.email}
                            currentRole={m.role}
                            canChangeRole={canChangeRole}
                            canRemove={canRemove}
                          />
                        ) : (
                          <Badge
                            variant={roleBadgeVariant(m.role)}
                            className="capitalize"
                          >
                            {m.role}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {isOwner && (
          <Card>
            <CardHeader>
              <CardTitle>Pending invites ({pendingInvites.length})</CardTitle>
              <CardDescription>
                Invites that haven&apos;t been accepted yet
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingInvites.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No pending invites.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingInvites.map((inv) => {
                    const inviter =
                      inv.inviterName || inv.inviterEmail || 'a team member';
                    return (
                      <div
                        key={inv.id}
                        className="flex flex-col gap-3 rounded-lg bg-[#0a0a0a] p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-zinc-100 truncate">
                              {inv.email}
                            </span>
                            <Badge
                              variant={roleBadgeVariant(inv.role)}
                              className="capitalize"
                            >
                              {inv.role}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Invited by {inviter} on {formatDate(inv.createdAt)}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Expires {formatRelativeFuture(inv.expiresAt)}
                          </p>
                        </div>
                        <div className="flex items-center">
                          <RevokeInviteButton
                            inviteId={inv.id}
                            email={inv.email}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isOwner && auditEntries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Audit log</CardTitle>
              <CardDescription>
                Recent membership and project changes ({auditEntries.length})
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-zinc-800/50">
                {auditEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                    <span className="text-zinc-300 truncate">
                      {describeAuditEntry(entry)}
                    </span>
                    <span
                      className="text-xs text-muted-foreground shrink-0"
                      title={new Date(entry.createdAt).toLocaleString()}
                    >
                      {formatRelativePast(entry.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
