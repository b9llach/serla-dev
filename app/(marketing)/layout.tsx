import Link from 'next/link';
import Image from 'next/image';
import { Header } from '@/components/marketing/header';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#09090b]">
      {/* Header with auth-aware navigation */}
      <Header />

      <main className="flex-1 pt-14">
        {children}
      </main>

      {/* Footer - Minimal */}
      <footer className="border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 text-white font-medium">
                <Image src="/icon.svg" alt="Serla" width={20} height={20} />
                serla
              </Link>
              <span className="text-zinc-700">|</span>
              <Link href="/pricing" className="text-sm text-zinc-500 hover:text-white transition-colors">
                Pricing
              </Link>
              <Link href="/docs" className="text-sm text-zinc-500 hover:text-white transition-colors">
                Docs
              </Link>
              <Link href="/privacy" className="text-sm text-zinc-500 hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-sm text-zinc-500 hover:text-white transition-colors">
                Terms
              </Link>
            </div>
            <p className="text-sm text-zinc-600">
              {new Date().getFullYear()} Serla
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
