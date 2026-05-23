import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db, users } from '@/lib/db';
import { eq, and, isNull } from 'drizzle-orm';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { DashboardProvider } from './provider';
import { getSelectedProjectId, getUserProjects } from '@/lib/utils/project';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/auth/signin');
  }

  // Get user's plan and role
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, session.userId), isNull(users.deletedAt)),
  });
  const userPlan = user?.plan || 'free';
  const userRole = user?.role || 'user';

  // Get user's projects via project_members (teams support).
  const memberships = await getUserProjects(session.userId);
  const userProjects = memberships.map(m => m.project);

  // Determine selected project from cookie, fallback to first project
  const selectedId = await getSelectedProjectId();
  const validSelectedId = selectedId && userProjects.some(p => p.id === selectedId)
    ? selectedId
    : userProjects[0]?.id;

  return (
    <DashboardProvider
      key={validSelectedId}
      initialProjects={userProjects}
      initialProjectId={validSelectedId}
    >
      {/* Mobile Navigation */}
      <MobileNav userPlan={userPlan} userRole={userRole} userName={user?.name || undefined} userEmail={user?.email} />

      {/* Desktop Layout */}
      <div className="hidden md:flex h-screen bg-[#0a0a0a] p-3">
        <Sidebar userPlan={userPlan} userRole={userRole} userName={user?.name || undefined} userEmail={user?.email} />
        <main className="flex-1 overflow-auto bg-[#141414] rounded-2xl ml-3">
          {children}
        </main>
      </div>

      {/* Mobile Layout */}
      <main className="md:hidden flex-1 overflow-auto bg-[#141414] min-h-[calc(100vh-56px)]">
        {children}
      </main>
    </DashboardProvider>
  );
}
