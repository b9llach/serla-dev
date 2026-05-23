'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { acceptInvite } from '@/lib/actions/members';

interface AcceptInviteFormProps {
  token: string;
}

export function AcceptInviteForm({ token }: AcceptInviteFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleAccept = async () => {
    setIsPending(true);
    setError(null);
    const result = await acceptInvite(token).catch(() => null);
    if (!result || !result.success) {
      setError(result?.error || 'Failed to accept invite');
      setIsPending(false);
      return;
    }
    setSuccess(true);
    // Brief delay so the user sees the success state before redirect.
    setTimeout(() => {
      router.push('/dashboard');
      router.refresh();
    }, 500);
  };

  if (success) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-sm text-zinc-300">
            Invite accepted. Redirecting to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        You&apos;ve been invited to join a project on Serla. Accept the invite
        to get access.
      </p>

      {error && (
        <div className="rounded-lg bg-red-950/20 border border-red-900/50 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <Button
        onClick={handleAccept}
        disabled={isPending}
        className="w-full bg-white text-black hover:bg-zinc-200"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Accepting...
          </>
        ) : (
          'Accept invite'
        )}
      </Button>

      <div className="text-center">
        <Link
          href="/dashboard"
          className="text-zinc-500 text-sm hover:text-white transition-colors"
        >
          Skip and go to dashboard
        </Link>
      </div>
    </div>
  );
}
