'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import 'rrweb-player/dist/style.css';

interface Props {
  recordingId: string;
}

interface RecordingMeta {
  id: string;
  sessionId: string;
  distinctId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  eventCount: number;
  sizeBytes: number;
  startUrl: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  deviceType: string | null;
  hasErrors: boolean;
}

export function ReplayPlayer({ recordingId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<RecordingMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    // rrweb-player is a Svelte component; instances expose $destroy() to clean
    // up. The published types don't reflect that on the constructor return, so
    // we widen via unknown.
    let playerInstance: { $destroy?: () => void } | null = null;

    (async () => {
      try {
        const res = await fetch(`/api/dashboard/recordings/${recordingId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load recording (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;

        setMeta(data.recording);

        if (!Array.isArray(data.events) || data.events.length < 2) {
          throw new Error('Recording has no playable events yet');
        }

        // rrweb-player publishes only an ESM build; lazy-import it client-side.
        // The stylesheet is imported at the top of this file as a static import,
        // which Next.js bundles via CSS modules.
        const { default: rrwebPlayer } = await import('rrweb-player');

        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = '';

        playerInstance = new rrwebPlayer({
          target: containerRef.current,
          props: {
            events: data.events as Array<{ type: number; data: unknown; timestamp: number }>,
            autoPlay: false,
            showController: true,
            width: containerRef.current.clientWidth,
            height: Math.min(600, containerRef.current.clientWidth * 0.6),
          },
        }) as unknown as { $destroy?: () => void };

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load recording');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (playerInstance?.$destroy) playerInstance.$destroy();
    };
  }, [recordingId]);

  return (
    <div className="space-y-4">
      {meta && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span>{meta.distinctId ?? 'anonymous'}</span>
          {meta.browser && <span>· {meta.browser}</span>}
          {meta.os && <span>· {meta.os}</span>}
          {meta.country && <span>· {meta.country}</span>}
          {meta.deviceType && <span>· {meta.deviceType}</span>}
          <span>· {(meta.sizeBytes / 1024).toFixed(0)} KB · {meta.eventCount.toLocaleString()} events</span>
          {meta.hasErrors && (
            <span className="inline-flex items-center gap-1 text-red-400">
              <AlertTriangle className="h-3 w-3" />
              errors captured
            </span>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-[400px] bg-[#1a1a1a] rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center h-[400px] bg-[#1a1a1a] rounded-xl text-center px-6">
          <AlertTriangle className="h-8 w-8 text-zinc-500 mb-2" />
          <p className="text-sm text-zinc-300">{error}</p>
        </div>
      )}

      <div
        ref={containerRef}
        className="rrweb-player-container bg-white rounded-xl overflow-hidden"
        style={{ display: loading || error ? 'none' : 'block' }}
      />
    </div>
  );
}
