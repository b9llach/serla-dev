'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Users,
  BarChart3,
  Shield,
  LogOut,
  ArrowLeft,
  ChevronUp,
  User,
} from 'lucide-react';
import { signOut } from '@/lib/auth/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navigation = [
  { name: 'Users', href: '/admin', icon: Users },
  { name: 'Statistics', href: '/admin/stats', icon: BarChart3 },
];

interface AdminSidebarProps {
  userName?: string;
  userEmail?: string;
}

export function AdminSidebar({ userName, userEmail }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-56 flex-col py-4">
      {/* Logo */}
      <div className="px-4 mb-6">
        <Link href="/admin" className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-500" />
          <span className="text-white font-medium">Admin</span>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/admin' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                isActive
                  ? 'bg-[#1a1a1a] text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50'
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
              {item.name}
            </Link>
          );
        })}

        <div className="h-px bg-[#1a1a1a] my-4" />

        {/* Back to Dashboard */}
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50 transition-colors"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
          Back to Dashboard
        </Link>
      </nav>

      {/* Bottom Section */}
      <div className="px-3 pt-4 space-y-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-between w-full rounded-lg px-3 py-2 text-[13px] text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50 transition-colors">
              <span className="flex items-center gap-3">
                <User className="h-[18px] w-[18px]" strokeWidth={1.5} />
                <span className="truncate max-w-[120px]">{userName || 'Account'}</span>
              </span>
              <ChevronUp className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-[200px] bg-[#1a1a1a] border-zinc-800"
          >
            {userEmail && (
              <>
                <DropdownMenuLabel className="text-zinc-400 font-normal text-xs truncate">
                  {userEmail}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800" />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 cursor-pointer text-zinc-300 focus:text-white focus:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
                Back to Dashboard
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <form action={signOut}>
              <DropdownMenuItem asChild>
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 cursor-pointer text-zinc-300 focus:text-white focus:bg-zinc-800"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.5} />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
