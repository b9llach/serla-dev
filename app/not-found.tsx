import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="text-center">
        <p className="text-zinc-600 text-sm font-medium mb-4">404</p>
        <h1 className="text-4xl font-medium text-white mb-4">Page not found</h1>
        <p className="text-zinc-500 mb-8 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild className="bg-white text-black hover:bg-zinc-200">
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="ghost" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
            <Link href="/docs">Read the docs</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
