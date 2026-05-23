import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { AdminSidebar } from '@/components/admin/sidebar';
import { AdminMobileNav } from '@/components/admin/mobile-nav';

async function getAdminUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  if (!user || user.role !== 'admin') return null;
  return user;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminUser();

  if (!admin) {
    redirect('/dashboard');
  }

  return (
    <>
      {/* Mobile Navigation */}
      <AdminMobileNav userName={admin.name || undefined} userEmail={admin.email} />

      {/* Desktop Layout - matches dashboard */}
      <div className="hidden md:flex h-screen bg-[#0a0a0a] p-3">
        <AdminSidebar userName={admin.name || undefined} userEmail={admin.email} />
        <main className="flex-1 overflow-auto bg-[#141414] rounded-2xl ml-3">
          {children}
        </main>
      </div>

      {/* Mobile Layout */}
      <main className="md:hidden flex-1 overflow-auto bg-[#141414] min-h-[calc(100vh-56px)]">
        {children}
      </main>
    </>
  );
}
