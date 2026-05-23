'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrength } from '@/components/ui/password-strength';
import { resetPassword } from '@/lib/auth/password-reset';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  if (!token) {
    return (
      <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
        <h1 className="text-xl font-medium text-white mb-2">Invalid link</h1>
        <p className="text-zinc-500 text-sm mb-6">
          This password reset link is invalid or has expired.
        </p>
        <Link href="/auth/forgot-password">
          <Button className="w-full bg-white text-black hover:bg-zinc-200">
            Request new link
          </Button>
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);
    const result = await resetPassword(token, password);
    setMessage(result.message);
    setIsSuccess(result.success);
    setIsLoading(false);
  };

  if (isSuccess) {
    return (
      <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
        <h1 className="text-xl font-medium text-white mb-2">Password reset</h1>
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <p className="text-zinc-300 text-sm">{message}</p>
          </div>
          <Link href="/auth/signin">
            <Button className="w-full bg-white text-black hover:bg-zinc-200">
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
      <h1 className="text-xl font-medium text-white mb-2">Set new password</h1>
      <p className="text-zinc-500 text-sm mb-6">
        Enter your new password below.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-zinc-400 text-sm">
            New password
          </Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            required
            minLength={8}
            className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
          />
          {password && <PasswordStrength password={password} />}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-zinc-400 text-sm">
            Confirm password
          </Label>
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            required
            minLength={8}
            className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
          />
        </div>

        {message && (
          <p className="text-red-400 text-sm">{message}</p>
        )}

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full bg-white text-black hover:bg-zinc-200"
        >
          {isLoading ? 'Resetting...' : 'Reset password'}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-white font-medium text-xl">
            serla
          </Link>
        </div>

        <Suspense fallback={
          <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-500">Loading...</p>
          </div>
        }>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
