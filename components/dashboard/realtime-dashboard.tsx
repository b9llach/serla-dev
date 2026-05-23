'use client';

import { useState, useCallback, useRef } from 'react';
import { useRealtime, useRealtimeEvent, RealtimeEvent } from '@/lib/contexts/realtime-context';
import { useDashboard } from '@/app/dashboard/provider';
import { Sparkline } from '@/components/dashboard/sparkline';
import { Bell, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardData {
  totalEvents: number;
  last24hEvents: number;
  totalUsers: number;
  last24hUsers: number;
  totalSessions: number;
  last24hSessions: number;
  dailyEvents: number[];
  dailyUsers: number[];
}

interface RealtimeDashboardProps {
  initialData: DashboardData;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export function RealtimeDashboard({ initialData }: RealtimeDashboardProps) {
  const [data, setData] = useState(initialData);
  const { realtimeToastsEnabled, setRealtimeToastsEnabled } = useDashboard();
  useRealtime(); // Keep connection alive
  // Dedup: the polling endpoint can return the same event id twice across
  // overlapping windows. Without this, today's sparkline and counters
  // double-count events received via real-time updates.
  const seenEventIds = useRef<Set<string>>(new Set());

  const handleNewEvent = useCallback((_event: RealtimeEvent) => {
    if (seenEventIds.current.has(_event.id)) return;
    seenEventIds.current.add(_event.id);
    if (seenEventIds.current.size > 1000) {
      const trimmed = Array.from(seenEventIds.current).slice(-500);
      seenEventIds.current = new Set(trimmed);
    }

    setData((prev) => {
      // Optimistic increment on today's sparkline (last item, oldest -> newest).
      let updatedDailyEvents = prev.dailyEvents;
      if (prev.dailyEvents.length > 0) {
        updatedDailyEvents = [...prev.dailyEvents];
        updatedDailyEvents[updatedDailyEvents.length - 1] += 1;
      }

      return {
        ...prev,
        totalEvents: prev.totalEvents + 1,
        last24hEvents: prev.last24hEvents + 1,
        dailyEvents: updatedDailyEvents,
      };
    });
  }, []);

  useRealtimeEvent(handleNewEvent);

  return (
    <div className="space-y-8">
      {/* Notifications toggle */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setRealtimeToastsEnabled(!realtimeToastsEnabled)}
          className={cn(
            'flex items-center gap-1.5 text-xs transition-colors',
            realtimeToastsEnabled ? 'text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'
          )}
          title={realtimeToastsEnabled ? 'Disable notifications' : 'Enable notifications'}
        >
          {realtimeToastsEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
          <span className="hidden sm:inline">
            {realtimeToastsEnabled ? 'Notifications on' : 'Notifications off'}
          </span>
        </button>
      </div>

      {/* Three-up metrics grid (events, users, sessions) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1a1a1a] rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-400">Events</span>
          </div>
          <div className="text-2xl font-semibold text-white">{formatNumber(data.totalEvents)}</div>
          <div className="text-xs text-zinc-500 mb-3">
            {formatNumber(data.last24hEvents)} in last 24h
          </div>
          <Sparkline data={data.dailyEvents} color="#3b82f6" height={40} />
        </div>

        <div className="bg-[#1a1a1a] rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-400">Users</span>
          </div>
          <div className="text-2xl font-semibold text-white">{formatNumber(data.totalUsers)}</div>
          <div className="text-xs text-zinc-500 mb-3">
            {formatNumber(data.last24hUsers)} in last 24h
          </div>
          <Sparkline data={data.dailyUsers} color="#8b5cf6" height={40} />
        </div>

        <div className="bg-[#1a1a1a] rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-400">Sessions</span>
          </div>
          <div className="text-2xl font-semibold text-white">{formatNumber(data.totalSessions)}</div>
          <div className="text-xs text-zinc-500 mb-3">
            {formatNumber(data.last24hSessions)} in last 24h
          </div>
          <div className="h-10 flex items-end">
            <div className="text-xs text-zinc-500">
              {data.totalSessions > 0 && data.totalEvents > 0
                ? `${(data.totalEvents / data.totalSessions).toFixed(1)} events/session`
                : 'No data yet'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
