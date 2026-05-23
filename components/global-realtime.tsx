'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface RealtimeEvent {
  id: string;
  name: string;
  distinctId?: string;
  sessionId: string;
  timestamp: string;
  properties?: Record<string, unknown>;
  pagePath?: string;
  pageUrl?: string;
  country?: string;
  browser?: string;
  deviceType?: string;
}

function formatCurrency(num: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

const REVENUE_PROPERTIES = ['revenue', 'amount', 'value', 'price', 'total'];

function extractRevenueValue(properties: Record<string, unknown> | undefined): number {
  if (!properties) return 0;

  for (const key of Object.keys(properties)) {
    const lowerKey = key.toLowerCase();
    if (REVENUE_PROPERTIES.some(prop => lowerKey.includes(prop))) {
      const value = properties[key];
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
          return parsed;
        }
      }
    }
  }
  return 0;
}

// Polling interval in milliseconds
const POLL_INTERVAL = 5000;

export function GlobalRealtimeNotifications() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('serla:realtime-toasts') === 'true';
    }
    return false;
  });
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPollTimeRef = useRef<string>(new Date().toISOString());
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // Listen for changes from other components
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'serla:realtime-toasts') {
        setEnabled(e.newValue === 'true');
      }
    };

    const handleCustomEvent = (e: CustomEvent<boolean>) => {
      setEnabled(e.detail);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('serla:realtime-toggle', handleCustomEvent as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('serla:realtime-toggle', handleCustomEvent as EventListener);
    };
  }, []);

  const handleEventRef = useRef<(event: RealtimeEvent) => void>(() => {});

  // Update ref when enabled changes
  useEffect(() => {
    handleEventRef.current = (event: RealtimeEvent) => {
      if (!enabled) return;

      const revenueValue = extractRevenueValue(event.properties);
      const parts: string[] = [];
      if (event.distinctId) parts.push(event.distinctId);
      if (event.country) parts.push(event.country);
      if (revenueValue > 0) parts.push(formatCurrency(revenueValue));

      toast.success(event.name, {
        description: parts.length > 0
          ? parts.join(' \u00b7 ')
          : (event.pagePath || 'New event'),
        duration: 3000,
      });
    };
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;

    // Only poll if notifications are enabled
    if (!enabled) {
      return;
    }

    const poll = async () => {
      if (!mountedRef.current || !enabled) return;

      try {
        const response = await fetch(`/api/dashboard/events/poll?since=${encodeURIComponent(lastPollTimeRef.current)}`);

        if (!response.ok || !mountedRef.current) return;

        const data = await response.json();

        // Update last poll time from server
        if (data.serverTime) {
          lastPollTimeRef.current = data.serverTime;
        }

        // Process new events
        if (data.events && Array.isArray(data.events)) {
          const newEvents = data.events
            .filter((event: RealtimeEvent) => !seenEventIdsRef.current.has(event.id))
            .reverse();

          for (const event of newEvents) {
            seenEventIdsRef.current.add(event.id);
            handleEventRef.current(event);
          }

          // Limit seen events cache
          if (seenEventIdsRef.current.size > 500) {
            const idsArray = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(idsArray.slice(-250));
          }
        }
      } catch {
        // Silently ignore poll errors for notifications
      }

      // Schedule next poll
      if (mountedRef.current && enabled) {
        pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL);
      }
    };

    poll();

    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, [enabled]);

  // This component doesn't render anything visible
  return null;
}
