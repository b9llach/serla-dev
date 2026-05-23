'use client';

import { useState } from 'react';
import Link from 'next/link';

interface MobileMenuButtonProps {
  isLoggedIn: boolean;
}

export function MobileMenuButton({ isLoggedIn }: MobileMenuButtonProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="md:hidden text-zinc-400 hover:text-white"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {mobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-14 left-0 right-0 border-t border-zinc-800/50 bg-[#09090b]">
          <div className="px-6 py-4 space-y-4">
            <Link
              href="/pricing"
              className="block text-sm text-zinc-400 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="/docs"
              className="block text-sm text-zinc-400 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Docs
            </Link>
            <div className="pt-4 border-t border-zinc-800/50 space-y-3">
              {isLoggedIn ? (
                <Link
                  href="/dashboard"
                  className="block text-sm bg-white text-black px-4 py-2 rounded-md text-center"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/auth/signin"
                    className="block text-sm text-zinc-400 hover:text-white"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Log in
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="block text-sm bg-white text-black px-4 py-2 rounded-md text-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
