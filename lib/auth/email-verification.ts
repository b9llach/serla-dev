'use server';

import { db, users, emailVerificationTokens } from '@/lib/db';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { sendEmailVerificationEmail } from '@/lib/email';
import crypto from 'crypto';

// Check if email verification is required
// Note: This is async to comply with 'use server' requirements
export async function isEmailVerificationEnabled(): Promise<boolean> {
  return process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
}

// Generate a secure random token
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Hash the token for storage
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function sendVerificationEmail(userId: string, email: string): Promise<boolean> {
  try {
    // Generate token
    const token = generateToken();
    const tokenHash = hashToken(token);

    // Token expires in 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Store the token
    await db.insert(emailVerificationTokens).values({
      userId,
      tokenHash,
      expiresAt,
    });

    // Send email
    await sendEmailVerificationEmail(email, token);

    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
}

export async function verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
  try {
    const tokenHash = hashToken(token);
    const now = new Date();

    // Atomic claim: same pattern as password-reset.ts. The token can only be
    // claimed by one concurrent request; the UPDATE's WHERE clause checks
    // that it's not already used.
    const claimedTokens = await db.update(emailVerificationTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          gt(emailVerificationTokens.expiresAt, now),
          isNull(emailVerificationTokens.usedAt)
        )
      )
      .returning({ id: emailVerificationTokens.id, userId: emailVerificationTokens.userId });

    if (claimedTokens.length === 0) {
      return { success: false, message: 'Invalid or expired verification link. Please request a new one.' };
    }

    // Mark email as verified
    await db.update(users)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(eq(users.id, claimedTokens[0].userId));

    return { success: true, message: 'Email verified successfully. You can now sign in.' };
  } catch (error) {
    console.error('Email verification error:', error);
    return { success: false, message: 'An error occurred. Please try again.' };
  }
}

export async function resendVerificationEmail(email: string): Promise<{ success: boolean; message: string }> {
  try {
    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { success: true, message: 'If an account exists with this email, you will receive a verification link.' };
    }

    // Check if already verified
    if (user.emailVerifiedAt) {
      return { success: true, message: 'Your email is already verified. You can sign in.' };
    }

    // Send new verification email
    await sendVerificationEmail(user.id, user.email);

    return { success: true, message: 'If an account exists with this email, you will receive a verification link.' };
  } catch (error) {
    console.error('Resend verification error:', error);
    return { success: false, message: 'An error occurred. Please try again.' };
  }
}
