'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
          <div className="text-center">
            <p className="text-zinc-600 text-sm font-medium mb-4">Error</p>
            <h1 className="text-4xl font-medium text-white mb-4">Something went wrong</h1>
            <p className="text-zinc-500 mb-8 max-w-md">
              A critical error occurred. Please try again.
            </p>
            {error.digest && (
              <p className="text-zinc-700 text-xs mb-8 font-mono">
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              className="bg-white text-black hover:bg-zinc-200 px-6 py-2 rounded-md font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
