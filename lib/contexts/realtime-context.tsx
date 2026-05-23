'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';

export interface RealtimeEvent {
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

type EventListener = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  connected: boolean;
  projectId: string | null;
  subscribe: (listener: EventListener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface RealtimeProviderProps {
  children: ReactNode;
}

// Polling interval in milliseconds
const POLL_INTERVAL = 5000; // 5 seconds

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [connected, setConnected] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const listenersRef = useRef<Set<EventListener>>(new Set());
  const lastPollTimeRef = useRef<string>(new Date().toISOString());
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      if (!mountedRef.current) return;

      try {
        const response = await fetch(`/api/dashboard/events/poll?since=${encodeURIComponent(lastPollTimeRef.current)}`);

        if (!response.ok) {
          setConnected(false);
          return;
        }

        const data = await response.json();

        if (!mountedRef.current) return;

        setConnected(true);
        setProjectId(data.projectId);

        // Update last poll time from server
        if (data.serverTime) {
          lastPollTimeRef.current = data.serverTime;
        }

        // Process new events (filter out already seen)
        if (data.events && Array.isArray(data.events)) {
          // Process events in chronological order (oldest first)
          const newEvents = data.events
            .filter((event: RealtimeEvent) => !seenEventIdsRef.current.has(event.id))
            .reverse();

          for (const event of newEvents) {
            seenEventIdsRef.current.add(event.id);
            // Notify all listeners
            listenersRef.current.forEach((listener) => {
              try {
                listener(event);
              } catch (err) {
                console.error('[Realtime] Listener error:', err);
              }
            });
          }

          // Limit seen events cache to prevent memory growth
          if (seenEventIdsRef.current.size > 1000) {
            const idsArray = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(idsArray.slice(-500));
          }
        }
      } catch (error) {
        console.error('[Realtime] Poll error:', error);
        setConnected(false);
      }

      // Schedule next poll
      if (mountedRef.current) {
        pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL);
      }
    };

    // Start polling
    poll();

    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const subscribe = useCallback((listener: EventListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ connected, projectId, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

// Hook for subscribing to events with automatic cleanup
export function useRealtimeEvent(onEvent: EventListener) {
  const { subscribe } = useRealtime();

  useEffect(() => {
    return subscribe(onEvent);
  }, [subscribe, onEvent]);
}
