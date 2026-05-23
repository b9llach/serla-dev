'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="text-center">
        <p className="text-zinc-600 text-sm font-medium mb-4">Error</p>
        <h1 className="text-4xl font-medium text-white mb-4">Something went wrong</h1>
        <p className="text-zinc-500 mb-8 max-w-md">
          An unexpected error occurred. Please try again or contact support if the problem persists.
        </p>
        {error.digest && (
          <p className="text-zinc-700 text-xs mb-8 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={reset}
            className="bg-white text-black hover:bg-zinc-200"
          >
            Try again
          </Button>
          <Button asChild variant="ghost" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
