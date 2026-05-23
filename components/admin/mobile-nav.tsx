'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Shield } from 'lucide-react';
import {
  Users,
  BarChart3,
  LogOut,
  ArrowLeft,
  User,
} from 'lucide-react';
import { signOut } from '@/lib/auth/actions';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const navigation = [
  { name: 'Users', href: '/admin', icon: Users },
  { name: 'Statistics', href: '/admin/stats', icon: BarChart3 },
];

interface AdminMobileNavProps {
  userName?: string;
  userEmail?: string;
}

export function AdminMobileNav({ userName, userEmail }: AdminMobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden flex items-center justify-between p-3 bg-[#0a0a0a]">
      {/* Logo */}
      <Link href="/admin" className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-red-500" />
        <span className="text-white font-medium">Admin</span>
      </Link>

      {/* Hamburger Menu */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="p-2 text-zinc-400 hover:text-white transition-colors">
            <Menu className="h-6 w-6" />
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72 bg-[#0a0a0a] border-zinc-800 p-0">
          <SheetHeader className="p-4 border-b border-zinc-800">
            <SheetTitle className="text-white text-left flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              Admin Panel
            </SheetTitle>
          </SheetHeader>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto max-h-[calc(100vh-200px)]">
            {navigation.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/admin' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-[#1a1a1a] text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50'
                  }`}
                >
                  <item.icon className="h-5 w-5" strokeWidth={1.5} />
                  {item.name}
                </Link>
              );
            })}

            <div className="h-px bg-[#1a1a1a] my-4" />

            {/* Back to Dashboard */}
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
              Back to Dashboard
            </Link>
          </nav>

          {/* Bottom Section */}
          <div className="absolute bottom-0 left-0 right-0 px-3 py-4 border-t border-zinc-800 bg-[#0a0a0a]">
            {/* User Info */}
            <div className="px-3 py-2 text-sm">
              <div className="flex items-center gap-3 text-zinc-300">
                <User className="h-5 w-5" strokeWidth={1.5} />
                <span className="truncate">{userName || 'Account'}</span>
              </div>
              {userEmail && (
                <p className="text-xs text-zinc-500 mt-1 ml-8 truncate">{userEmail}</p>
              )}
            </div>

            <form action={signOut}>
              <button
                type="submit"
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50 transition-colors"
              >
                <LogOut className="h-5 w-5" strokeWidth={1.5} />
                Sign out
              </button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
