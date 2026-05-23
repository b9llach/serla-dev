'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
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
  ChevronUp,
  ChevronRight,
  User,
  Shield,
  Flame,
  BellRing,
  Video,
  ToggleLeft,
  Sparkles,
  Bug,
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
import { ProjectSelector } from './project-selector';
import { canAccess } from '@/components/dashboard/feature-gate';

type NavItem = {
  name: string;
  href: string;
  icon: typeof Home;
  feature?: string;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

// Always-visible items at the top of the sidebar.
const topLevel: NavItem[] = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Activity', href: '/dashboard/events', icon: Activity },
];

// Grouped sections - each collapses independently. The active route's group
// auto-expands on first paint so users don't land on a page hidden behind a
// closed accordion.
const groups: NavGroup[] = [
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { name: 'Funnels', href: '/dashboard/funnels', icon: GitMerge, feature: 'funnels' },
      { name: 'Retention', href: '/dashboard/retention', icon: Users, feature: 'retention' },
      { name: 'Journeys', href: '/dashboard/journeys', icon: Map, feature: 'journeys' },
      { name: 'Goals', href: '/dashboard/goals', icon: Flag, feature: 'goals' },
      { name: 'Heatmaps', href: '/dashboard/heatmaps', icon: Flame, feature: 'heatmaps' },
      { name: 'Attribution', href: '/dashboard/attribution', icon: Link2, feature: 'attribution' },
      { name: 'Segments', href: '/dashboard/segments', icon: SlidersHorizontal, feature: 'segments' },
      { name: 'Metrics', href: '/dashboard/metrics', icon: Layers, feature: 'customMetrics' },
    ],
  },
  {
    id: 'product',
    label: 'Product',
    items: [
      { name: 'Replays', href: '/dashboard/replays', icon: Video, feature: 'sessionReplay' },
      { name: 'Errors', href: '/dashboard/errors', icon: Bug, feature: 'errorTracking' },
      { name: 'LLM', href: '/dashboard/llm', icon: Sparkles, feature: 'llmObservability' },
      { name: 'Flags', href: '/dashboard/flags', icon: ToggleLeft, feature: 'featureFlags' },
    ],
  },
  {
    id: 'operate',
    label: 'Operate',
    items: [
      { name: 'Alerts', href: '/dashboard/alerts', icon: BellRing, feature: 'alerts' },
      { name: 'Webhooks', href: '/dashboard/webhooks', icon: Send, feature: 'webhooks' },
      { name: 'Export', href: '/dashboard/export', icon: FileDown, feature: 'export' },
    ],
  },
];

const settingsNavigation: NavItem[] = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  { name: 'API Keys', href: '/dashboard/settings/api-keys', icon: Key },
  { name: 'Team', href: '/dashboard/settings/team', icon: UserPlus },
  { name: 'Billing', href: '/dashboard/settings/billing', icon: Receipt },
];

const OPEN_STATE_KEY = 'serla:sidebar:open-groups';

interface SidebarProps {
  userPlan?: string;
  userRole?: string;
  userName?: string;
  userEmail?: string;
}

export function Sidebar({ userPlan = 'free', userRole = 'user', userName, userEmail }: SidebarProps) {
  const pathname = usePathname();

  // Track which groups are open. Initialized to "the group containing the
  // active route", then merged with whatever the user previously set in
  // localStorage so their preferences persist across page loads.
  const activeGroup = groups.find(g =>
    g.items.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (activeGroup) initial[activeGroup.id] = true;
    return initial;
  });

  // Hydrate from localStorage on mount and write back on change.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(OPEN_STATE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        setOpenGroups(prev => ({ ...parsed, ...prev }));
      }
    } catch {
      // localStorage unavailable - silently fall back to defaults.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(OPEN_STATE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const isActiveHref = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  const renderItem = (item: NavItem, indent = false) => {
    const isActive = isActiveHref(item.href);
    const hasAccess = !item.feature || canAccess(item.feature, userPlan);
    return (
      <Link
        key={item.name}
        href={item.href}
        className={`flex items-center justify-between rounded-lg ${indent ? 'pl-7 pr-3' : 'px-3'} py-1.5 text-[13px] transition-colors ${
          isActive
            ? 'bg-[#1a1a1a] text-white'
            : hasAccess
              ? 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50'
              : 'text-zinc-600 hover:text-zinc-500 hover:bg-[#1a1a1a]/30'
        }`}
      >
        <span className="flex items-center gap-3">
          <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
          {item.name}
        </span>
        {!hasAccess && <Lock className="h-3 w-3 text-zinc-600" strokeWidth={2} />}
      </Link>
    );
  };

  return (
    <div className="flex h-full w-56 flex-col py-4">
      {/* Logo */}
      <div className="px-4 mb-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/icon.svg" alt="Serla" width={20} height={20} />
          <span className="text-white font-medium">serla</span>
        </Link>
      </div>

      {/* Project Selector */}
      <div className="px-3 mb-4">
        <ProjectSelector />
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {/* Top-level: Home + Activity, always visible. */}
        {topLevel.map(item => renderItem(item))}

        {/* Collapsible accordion groups. */}
        {groups.map(group => {
          const isOpen = !!openGroups[group.id];
          const hasActive = group.items.some(i => isActiveHref(i.href));
          return (
            <div key={group.id} className="pt-2">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-expanded={isOpen}
              >
                <span>{group.label}</span>
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  strokeWidth={2}
                />
              </button>
              {/* Collapsed sections still show a dot next to the label if the
                  active route is inside, so users see at a glance that the
                  current page is hidden behind a closed accordion. */}
              {!isOpen && hasActive && (
                <span className="absolute -mt-5 ml-1 inline-block h-1 w-1 rounded-full bg-blue-400" aria-hidden="true" />
              )}
              {isOpen && (
                <div className="space-y-0.5 mt-0.5">
                  {group.items.map(item => renderItem(item, true))}
                </div>
              )}
            </div>
          );
        })}

        <div className="h-px bg-[#1a1a1a] my-4" />

        {settingsNavigation.map(item => {
          const isActive = isActiveHref(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
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
      </nav>

      {/* Bottom Section */}
      <div className="px-3 pt-4 space-y-0.5">
        <Link
          href="/docs"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1a]/50 transition-colors"
        >
          <BookOpen className="h-[18px] w-[18px]" strokeWidth={1.5} />
          Docs
        </Link>

        <div className="h-px bg-[#1a1a1a] my-3" />

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
            {userRole === 'admin' && (
              <>
                <DropdownMenuItem asChild>
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 cursor-pointer text-red-400 focus:text-red-300 focus:bg-red-500/10"
                  >
                    <Shield className="h-4 w-4" strokeWidth={1.5} />
                    Admin Panel
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-800" />
              </>
            )}
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
