'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { verifyEmail, resendVerificationEmail } from '@/lib/auth/email-verification';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [email, setEmail] = useState('');
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    const doVerify = async () => {
      if (!token) return;
      setIsVerifying(true);
      const result = await verifyEmail(token);
      setVerificationResult(result);
      setIsVerifying(false);
    };

    if (token && !verificationResult) {
      doVerify();
    }
  }, [token, verificationResult]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResending(true);
    setResendMessage('');
    const result = await resendVerificationEmail(email);
    setResendMessage(result.message);
    setIsResending(false);
  };

  // Show verification result if we have a token
  if (token) {
    return (
      <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
        {isVerifying ? (
          <>
            <h1 className="text-xl font-medium text-white mb-2">Verifying email</h1>
            <p className="text-zinc-500 text-sm">Please wait...</p>
          </>
        ) : verificationResult ? (
          <>
            <h1 className="text-xl font-medium text-white mb-2">
              {verificationResult.success ? 'Email verified' : 'Verification failed'}
            </h1>
            <div className="space-y-4">
              <div className={`border rounded-lg p-4 ${
                verificationResult.success
                  ? 'bg-zinc-900 border-zinc-800'
                  : 'bg-red-950/20 border-red-900/50'
              }`}>
                <p className={`text-sm ${verificationResult.success ? 'text-zinc-300' : 'text-red-400'}`}>
                  {verificationResult.message}
                </p>
              </div>
              {verificationResult.success ? (
                <Link href="/auth/signin">
                  <Button className="w-full bg-white text-black hover:bg-zinc-200">
                    Sign in
                  </Button>
                </Link>
              ) : (
                <Link href="/auth/verify-email">
                  <Button variant="ghost" className="w-full text-zinc-400 hover:text-white">
                    Request new link
                  </Button>
                </Link>
              )}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // Show resend form if no token
  return (
    <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
      <h1 className="text-xl font-medium text-white mb-2">Verify your email</h1>
      <p className="text-zinc-500 text-sm mb-6">
        Enter your email to receive a verification link.
      </p>

      <form onSubmit={handleResend} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-zinc-400 text-sm">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
          />
        </div>

        {resendMessage && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <p className="text-zinc-300 text-sm">{resendMessage}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={isResending}
          className="w-full bg-white text-black hover:bg-zinc-200"
        >
          {isResending ? 'Sending...' : 'Send verification link'}
        </Button>

        <div className="text-center">
          <Link
            href="/auth/signin"
            className="text-zinc-500 text-sm hover:text-white transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function VerifyEmailPage() {
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
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
