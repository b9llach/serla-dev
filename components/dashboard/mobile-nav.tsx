'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import {
  Home,
  Activity,
  Layers,
  GitMerge,
  Users,
  Flag,
  SlidersHorizontal,
  Link2,
  Send,
  FileDown,
  Settings,
  Key,
  Receipt,
  UserPlus,
  LogOut,
  BookOpen,
  Lock,
  Map,
  User,
  Shield,
  Flame,
  BellRing,
} from 'lucide-react';
import { signOut } from '@/lib/auth/actions';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ProjectSelector } from './project-selector';

// Feature access by plan
const featureAccess: Record<string, string[]> = {
  funnels: ['hobby', 'pro', 'max'],
  retention: ['hobby', 'pro', 'max'],
  attribution: ['hobby', 'pro', 'max'],
  webhooks: ['hobby', 'pro', 'max'],
  segments: ['hobby', 'pro', 'max'],
  journeys: ['pro', 'max'],
  customMetrics: ['pro', 'max'],
  export: ['pro', 'max'],
};

function canAccess(feature: string | undefined, userPlan: string): boolean {
  if (!feature) return true;
  const allowedPlans = featureAccess[feature];
  if (!allowedPlans) return true;
  return allowedPlans.includes(userPlan);
}

const navigation = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Metrics', href: '/dashboard/metrics', icon: Layers, feature: 'customMetrics' },
  { name: 'Funnels', href: '/dashboard/funnels', icon: GitMerge, feature: 'funnels' },
  { name: 'Retention', href: '/dashboard/retention', icon: Users, feature: 'retention' },
  { name: 'Journeys', href: '/dashboard/journeys', icon: Map, feature: 'journeys' },
  { name: 'Goals', href: '/dashboard/goals', icon: Flag, feature: 'goals' },
  { name: 'Heatmaps', href: '/dashboard/heatmaps', icon: Flame, feature: 'heatmaps' },
  { name: 'Segments', href: '/dashboard/segments', icon: SlidersHorizontal, feature: 'segments' },
  { name: 'Attribution', href: '/dashboard/attribution', icon: Link2, feature: 'attribution' },
  { name: 'Activity', href: '/dashboard/events', icon: Activity },
  { name: 'Alerts', href: '/dashboard/alerts', icon: BellRing, feature: 'alerts' },
  { name: 'Webhooks', href: '/dashboard/webhooks', icon: Send, feature: 'webhooks' },
  { name: 'Export', href: '/dashboard/export', icon: FileDown, feature: 'export' },
];

const settingsNavigation = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  { name: 'API Keys', href: '/dashboard/settings/api-keys', icon: Key },
  { name: 'Team', href: '/dashboard/settings/team', icon: UserPlus },
  { name: 'Billing', href: '/dashboard/settings/billing', icon: Receipt },
];

interface MobileNavProps {
  userPlan?: string;
  userRole?: string;
  userName?: string;
  userEmail?: string;
}

export function MobileNav({ userPlan = 'free', userRole = 'user', userName, userEmail }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden flex items-center justify-between p-3 bg-[#0a0a0a]">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image src="/icon.svg" alt="Serla" width={20} height={20} />
        <span className="text-white font-medium">serla</span>
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
              <Image src="/icon.svg" alt="Serla" width={20} height={20} />
              serla
            </SheetTitle>
          </SheetHeader>

          {/* Project Selector */}
          <div className="px-3 py-3 border-b border-zinc-800">
            <ProjectSelector />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto max-h-[calc(100vh-200px)]">
            {navigation.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              const hasAccess = canAccess(item.feature, userPlan);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-[#1a1a1a] text-white'
                      : hasAccess
                        ? 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50'
                        : 'text-zinc-600 hover:text-zinc-500 hover:bg-[#1a1a1a]/30'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <item.icon className="h-5 w-5" strokeWidth={1.5} />
                    {item.name}
                  </span>
                  {!hasAccess && (
                    <Lock className="h-3.5 w-3.5 text-zinc-600" strokeWidth={2} />
                  )}
                </Link>
              );
            })}

            <div className="h-px bg-[#1a1a1a] my-4" />

            {settingsNavigation.map((item) => {
              const isActive = pathname === item.href;
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

          </nav>

          {/* Bottom Section */}
          <div className="absolute bottom-0 left-0 right-0 px-3 py-4 border-t border-zinc-800 bg-[#0a0a0a]">
            <Link
              href="/docs"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50 transition-colors"
            >
              <BookOpen className="h-5 w-5" strokeWidth={1.5} />
              Docs
            </Link>

            <div className="h-px bg-[#1a1a1a] my-3" />

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

            {/* Admin Link */}
            {userRole === 'admin' && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              >
                <Shield className="h-5 w-5" strokeWidth={1.5} />
                Admin Panel
              </Link>
            )}

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
