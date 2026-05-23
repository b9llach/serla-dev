'use client';

import { useState, useCallback, useTransition } from 'react';
import { Event } from '@/lib/db/schema';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/utils/date';
import { useRealtime, useRealtimeEvent, RealtimeEvent } from '@/lib/contexts/realtime-context';
import { cn } from '@/lib/utils';
import { Radio, Bell, BellOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useDashboard } from '@/app/dashboard/provider';
import { loadMoreEvents } from '@/lib/actions/events';

interface EventsTableProps {
  events: Event[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount?: number;
  filters?: {
    name?: string;
    startDate?: string;
    endDate?: string;
  };
}

export function EventsTable({
  events: initialEvents,
  hasMore: initialHasMore,
  nextCursor: initialCursor,
  totalCount: initialCount,
  filters = {}
}: EventsTableProps) {
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [totalCount, setTotalCount] = useState(initialCount || 0);
  const [isPending, startTransition] = useTransition();
  const { realtimeToastsEnabled, setRealtimeToastsEnabled } = useDashboard();
  const { connected } = useRealtime();

  const handleNewEvent = useCallback((event: RealtimeEvent) => {
    setRealtimeEvents((prev) => {
      // Keep only the last 50 real-time events to prevent memory issues
      const updated = [event, ...prev].slice(0, 50);
      return updated;
    });
    setTotalCount((prev) => prev + 1);

    // Show toast notification if enabled
    if (realtimeToastsEnabled) {
      toast(event.name, {
        description: event.distinctId
          ? `User: ${event.distinctId}`
          : event.pagePath || 'New event received',
      });
    }
  }, [realtimeToastsEnabled]);

  // Subscribe to real-time events using the global connection
  useRealtimeEvent(handleNewEvent);

  const loadMore = () => {
    if (!nextCursor || isPending) return;

    startTransition(async () => {
      const result = await loadMoreEvents({
        cursor: nextCursor,
        name: filters.name,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

      setEvents(prev => [...prev, ...result.events]);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    });
  };

  // Combine real-time events with loaded events
  const allEvents = [
    ...realtimeEvents.map((e) => ({
      id: e.id,
      name: e.name,
      distinctId: e.distinctId || null,
      sessionId: e.sessionId,
      timestamp: new Date(e.timestamp),
      properties: e.properties || {},
      pagePath: e.pagePath || null,
      pageUrl: e.pageUrl || null,
      country: e.country || null,
      browser: e.browser || null,
      deviceType: e.deviceType || null,
      os: null,
      isRealtime: true,
    })),
    ...events.map((e) => ({ ...e, isRealtime: false })),
  ];

  const hasFilters = filters.name || filters.startDate || filters.endDate;

  if (allEvents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {hasFilters ? (
          'No events match your filters. Try adjusting them.'
        ) : (
          <div className="text-center">
            <p>No events recorded yet.</p>
            <p className="text-xs mt-2">
              <Link href="/docs" className="underline hover:text-foreground">
                See the docs
              </Link>{' '}
              to install the SDK.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Real-time indicator - fixed at top */}
      <div className="flex items-center justify-between py-3 px-1 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-1.5 text-xs',
              connected ? 'text-green-500' : 'text-zinc-500'
            )}>
              <Radio className={cn('h-3 w-3', connected && 'animate-pulse')} />
              {connected ? 'Live' : 'Connecting...'}
            </div>
            {realtimeEvents.length > 0 && (
              <span className="text-xs text-zinc-500">
                +{realtimeEvents.length} new
              </span>
            )}
          </div>
          {/* Toast notifications toggle */}
          <button
            onClick={() => setRealtimeToastsEnabled(!realtimeToastsEnabled)}
            className={cn(
              'flex items-center gap-1.5 text-xs transition-colors',
              realtimeToastsEnabled ? 'text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'
            )}
            title={realtimeToastsEnabled ? 'Disable notifications' : 'Enable notifications'}
          >
            {realtimeToastsEnabled ? (
              <Bell className="h-3 w-3" />
            ) : (
              <BellOff className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">
              {realtimeToastsEnabled ? 'Notifications on' : 'Notifications off'}
            </span>
          </button>
        </div>
        {totalCount > 0 && (
          <span className="text-xs text-zinc-500">
            {totalCount.toLocaleString()} total events
          </span>
        )}
      </div>

      {/* Scrollable table area */}
      <div className="flex-1 min-h-0 bg-[#1a1a1a] rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="sticky top-0 bg-[#1a1a1a] z-10">
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead className="hidden sm:table-cell">User</TableHead>
                <TableHead className="hidden lg:table-cell">Page</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden lg:table-cell">Device</TableHead>
                <TableHead>Time</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allEvents.map((event, index) => (
                <TableRow
                  key={`${event.id}-${index}`}
                  className={cn(
                    (event as { isRealtime?: boolean }).isRealtime && 'bg-green-500/5 animate-in fade-in-0 slide-in-from-top-2 duration-300'
                  )}
                >
                  <TableCell>
                    <Badge variant="secondary">{event.name}</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {event.distinctId || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell max-w-[200px] truncate text-muted-foreground">
                    {event.pagePath || '-'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {event.country || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {event.browser ? `${event.browser}${event.os ? ` / ${event.os}` : ''}` : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDateTime(event.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Event Details</DialogTitle>
                        </DialogHeader>
                        <EventDetails event={event as Event} />
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Load more button - fixed at bottom of scroll area */}
        {hasMore && (
          <div className="flex justify-center py-4 border-t border-zinc-800 shrink-0">
            <Button
              variant="ghost"
              onClick={loadMore}
              disabled={isPending}
              className="text-zinc-400 hover:text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load more'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EventDetails({ event }: { event: Event }) {
  const properties = event.properties as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Event Name</span>
          <p className="font-medium">{event.name}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Timestamp</span>
          <p className="font-medium">{formatDateTime(event.timestamp)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">User ID</span>
          <p className="font-medium">{event.distinctId || '-'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Session ID</span>
          <p className="font-medium font-mono text-xs">{event.sessionId || '-'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Page URL</span>
          <p className="font-medium truncate">{event.pageUrl || '-'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Page Path</span>
          <p className="font-medium">{event.pagePath || '-'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Referrer</span>
          <p className="font-medium truncate">{event.referrer || '-'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Country</span>
          <p className="font-medium">{event.country || '-'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Browser</span>
          <p className="font-medium">{event.browser || '-'} {event.browserVersion || ''}</p>
        </div>
        <div>
          <span className="text-muted-foreground">OS</span>
          <p className="font-medium">{event.os || '-'} {event.osVersion || ''}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Device Type</span>
          <p className="font-medium">{event.deviceType || '-'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">UTM Source</span>
          <p className="font-medium">{event.utmSource || '-'}</p>
        </div>
      </div>

      {Object.keys(properties).length > 0 && (
        <div>
          <span className="text-muted-foreground text-sm">Custom Properties</span>
          <pre className="mt-2 p-4 bg-muted rounded-lg overflow-x-auto text-xs">
            {JSON.stringify(properties, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
