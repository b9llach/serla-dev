import { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import { AcceptInviteForm } from './accept-invite-form';

export const metadata: Metadata = {
  title: 'Accept invite',
};

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitePage({
  searchParams,
}: AcceptInvitePageProps) {
  const params = await searchParams;
  const token = params.token;
  const session = await getSession();

  if (!token) {
    return (
      <Shell title="Invalid link">
        <p className="text-sm text-zinc-400">
          This invite link is missing a token. Ask your inviter to send a new
          link.
        </p>
      </Shell>
    );
  }

  // If the user isn't signed in, route them to sign in or sign up first,
  // preserving the token so we can accept after auth.
  if (!session) {
    const next = `/auth/accept-invite?token=${encodeURIComponent(token)}`;
    const signinHref = `/auth/signin?next=${encodeURIComponent(next)}`;
    const signupHref = `/auth/signup?next=${encodeURIComponent(next)}`;
    return (
      <Shell title="Accept your invite">
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            You&apos;ve been invited to join a project on Serla. Sign in or
            create an account to accept it.
          </p>
          <div className="space-y-2">
            <Link href={signinHref} className="block">
              <Button className="w-full bg-white text-black hover:bg-zinc-200">
                Sign in
              </Button>
            </Link>
            <Link href={signupHref} className="block">
              <Button
                variant="ghost"
                className="w-full text-zinc-300 hover:text-white"
              >
                Create an account
              </Button>
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Accept your invite">
      <AcceptInviteForm token={token} />
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-white font-medium text-xl">
            serla
          </Link>
        </div>
        <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
          <h1 className="text-xl font-medium text-white mb-4">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
