'use server';

import { db, users, projects, projectMembers } from '@/lib/db';
import { hashPassword, verifyPassword } from './password';
import { createSession, setSessionCookie, clearSession } from './session';
import { sendVerificationEmail, isEmailVerificationEnabled } from './email-verification';
import { sendWelcomeEmail } from '@/lib/email';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const signUpSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type AuthState = {
  error?: string;
  success?: boolean;
};

export async function signUp(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const rawData = {
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const result = signUpSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { name, email, password } = result.data;

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (existingUser) {
    return { error: 'An account with this email already exists' };
  }

  // Create user
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({
    name,
    email: email.toLowerCase(),
    passwordHash,
  }).returning();

  // Create a default project for the new user. No API key is auto-generated -
  // the onboarding wizard prompts them to mint one explicitly so the
  // plaintext is shown once at creation rather than silently discarded.
  const [defaultProject] = await db.insert(projects).values({
    userId: user.id,
    name: 'My Project',
  }).returning({ id: projects.id });

  // Register the creator as the owner in project_members - all role checks
  // go through that table now, not projects.userId.
  await db.insert(projectMembers).values({
    projectId: defaultProject.id,
    userId: user.id,
    role: 'owner',
  });

  // Send welcome email (don't await - send in background)
  sendWelcomeEmail(user.email, user.name || undefined);

  // Check if email verification is required
  if (await isEmailVerificationEnabled()) {
    await sendVerificationEmail(user.id, user.email);
    redirect('/auth/verify-email?pending=true');
  }

  // Create session (if no email verification required)
  const token = await createSession({ userId: user.id, email: user.email });
  await setSessionCookie(token);

  redirect('/dashboard');
}

export async function signIn(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
  };
  // "Remember me" checkbox - when checked, session lasts 30 days instead of 7.
  const remember = formData.get('remember') === 'on';

  const result = signInSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { email, password } = result.data;

  // Find user
  const user = await db.query.users.findFirst({
    where: and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)),
  });

  if (!user) {
    return { error: 'Invalid email or password' };
  }

  // Verify password
  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    return { error: 'Invalid email or password' };
  }

  // Check if email verification is required and not verified
  if ((await isEmailVerificationEnabled()) && !user.emailVerifiedAt) {
    return { error: 'Please verify your email before signing in. Check your inbox or request a new verification link.' };
  }

  // Create session - "remember me" extends from 7d to 30d.
  const token = await createSession({ userId: user.id, email: user.email }, { remember });
  await setSessionCookie(token, { remember });

  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect('/');
}
