'use server';

import { db, users, passwordResetTokens } from '@/lib/db';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { hashPassword } from './password';
import { sendPasswordResetEmail } from '@/lib/email';
import crypto from 'crypto';

// Generate a secure random token
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Hash the token for storage (we don't store raw tokens)
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  try {
    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { success: true, message: 'If an account exists with this email, you will receive a password reset link.' };
    }

    // Generate token
    const token = generateToken();
    const tokenHash = hashToken(token);

    // Token expires in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Store the token
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // Send email
    await sendPasswordResetEmail(user.email, token);

    return { success: true, message: 'If an account exists with this email, you will receive a password reset link.' };
  } catch (error) {
    console.error('Password reset request error:', error);
    return { success: false, message: 'An error occurred. Please try again.' };
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  try {
    // Validate password
    if (newPassword.length < 8) {
      return { success: false, message: 'Password must be at least 8 characters.' };
    }

    // Hash the provided token to compare with stored hash
    const tokenHash = hashToken(token);

    // Atomically mark token as used first to prevent race conditions
    // This ensures only one request can claim the token
    const now = new Date();
    const claimedTokens = await db.update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          gt(passwordResetTokens.expiresAt, now),
          isNull(passwordResetTokens.usedAt)
        )
      )
      .returning({ id: passwordResetTokens.id, userId: passwordResetTokens.userId });

    // If no token was claimed, it's either invalid, expired, or already used
    if (claimedTokens.length === 0) {
      return { success: false, message: 'Invalid or expired reset link. Please request a new one.' };
    }

    const resetToken = claimedTokens[0];

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    await db.update(users)
      .set({
        passwordHash,
        updatedAt: now,
      })
      .where(eq(users.id, resetToken.userId));

    return { success: true, message: 'Password reset successfully. You can now sign in.' };
  } catch (error) {
    console.error('Password reset error:', error);
    return { success: false, message: 'An error occurred. Please try again.' };
  }
}
