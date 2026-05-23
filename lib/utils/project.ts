import { cookies } from 'next/headers';
import { db, projects, projectMembers } from '@/lib/db';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { Project } from '@/lib/db/schema';

const COOKIE_NAME = 'serla:project';

export type ProjectRole = 'owner' | 'editor' | 'viewer';

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export async function getSelectedProjectId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

/**
 * Return all projects this user is a member of (any role), excluding soft-deleted ones.
 * Ordered by creation date for stable selector positions.
 */
async function getUserMembershipProjects(
  userId: string
): Promise<Array<{ project: Project; role: ProjectRole }>> {
  const rows = await db
    .select({
      project: projects,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.createdAt));

  return rows.map(r => ({ project: r.project as Project, role: r.role as ProjectRole }));
}

/**
 * Get the user's "current" project for a dashboard render. Reads the
 * serla:project cookie; if invalid or the user isn't a member of that project,
 * falls back to the first project they're a member of.
 */
export async function getCurrentProject(userId: string): Promise<Project | null> {
  const memberships = await getUserMembershipProjects(userId);
  if (memberships.length === 0) return null;

  const selectedId = await getSelectedProjectId();
  const selected = selectedId ? memberships.find(m => m.project.id === selectedId) : null;
  return (selected || memberships[0]!).project;
}

/**
 * Same as getCurrentProject, but also returns the user's role on it.
 * Use this in pages that need to gate UI by role.
 */
export async function getCurrentProjectWithRole(
  userId: string
): Promise<{ project: Project; role: ProjectRole } | null> {
  const memberships = await getUserMembershipProjects(userId);
  if (memberships.length === 0) return null;

  const selectedId = await getSelectedProjectId();
  const selected = selectedId ? memberships.find(m => m.project.id === selectedId) : null;
  return selected || memberships[0]!;
}

/**
 * Return the user's role on a project, or null if they aren't a member.
 * The check uses the project_members table - projects.userId is no longer
 * authoritative for access since teams was introduced.
 */
export async function getProjectMembership(
  userId: string,
  projectId: string
): Promise<ProjectRole | null> {
  const row = await db.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId),
    ),
  });
  return row ? (row.role as ProjectRole) : null;
}

/**
 * Verify the user has at least the given role on the project. Returns the
 * user's actual role on success, or null on failure.
 * Server actions should use this and treat null as "not found" (don't leak
 * the difference between "no project" and "not authorized").
 */
export async function requireRole(
  userId: string,
  projectId: string,
  minRole: ProjectRole
): Promise<ProjectRole | null> {
  const role = await getProjectMembership(userId, projectId);
  if (!role) return null;
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) return null;
  return role;
}

/**
 * Return every project the user is a member of, with role. Used by the
 * project selector dropdown and the dashboard layout.
 */
export async function getUserProjects(
  userId: string
): Promise<Array<{ project: Project; role: ProjectRole }>> {
  return getUserMembershipProjects(userId);
}
