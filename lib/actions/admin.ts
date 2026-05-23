'use server';

import { db, users } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import { eq, and, isNull } from 'drizzle-orm';

async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, session.userId), isNull(users.deletedAt)),
  });

  if (!user || user.role !== 'admin') {
    throw new Error('Forbidden: Admin access required');
  }

  return user;
}

export async function updateUserPlan(userId: string, plan: string) {
  await requireAdmin();

  const validPlans = ['free', 'hobby', 'pro', 'max'];
  if (!validPlans.includes(plan)) {
    throw new Error('Invalid plan');
  }

  await db.update(users)
    .set({
      plan,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  revalidatePath('/admin');
}

export async function updateUserRole(userId: string, role: string) {
  const admin = await requireAdmin();

  const validRoles = ['user', 'admin'];
  if (!validRoles.includes(role)) {
    throw new Error('Invalid role');
  }

  // Prevent admin from demoting themselves
  if (admin.id === userId && role !== 'admin') {
    throw new Error('Cannot change your own role');
  }

  await db.update(users)
    .set({
      role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  revalidatePath('/admin');
}

export async function deleteUser(userId: string) {
  const admin = await requireAdmin();

  // Prevent admin from deleting themselves
  if (admin.id === userId) {
    throw new Error('Cannot delete your own account');
  }

  // Soft-delete user
  await db.update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, userId));

  revalidatePath('/admin');
}

export async function getUserStats(userId: string) {
  await requireAdmin();

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), isNull(users.deletedAt)),
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}
