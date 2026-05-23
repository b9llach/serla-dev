import Link from 'next/link';
import Image from 'next/image';
import { getSession } from '@/lib/auth/session';
import { MobileMenuButton } from './mobile-menu-button';

export async function Header() {
  const session = await getSession();
  const isLoggedIn = !!session;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-800/50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-white font-medium text-lg tracking-tight">
            <Image src="/icon.svg" alt="Serla" width={24} height={24} />
            serla
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/pricing"
              className="text-sm text-zinc-500 hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/docs"
              className="text-sm text-zinc-500 hover:text-white transition-colors"
            >
              Docs
            </Link>
          </nav>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-4">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="text-sm bg-white text-black px-4 py-1.5 rounded-md hover:bg-zinc-200 transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className="text-sm text-zinc-500 hover:text-white transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/auth/signup"
                  className="text-sm bg-white text-black px-4 py-1.5 rounded-md hover:bg-zinc-200 transition-colors"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <MobileMenuButton isLoggedIn={isLoggedIn} />
        </div>
      </div>
    </header>
  );
}
