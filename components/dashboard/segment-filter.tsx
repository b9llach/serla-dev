'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Users, ChevronDown, Check } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Segment {
  id: string;
  name: string;
}

interface Props {
  segments: Segment[];
  selectedId: string | null;
}

/**
 * Cross-feature segment selector. Writes `?segment=<id>` to the URL so the
 * server component re-runs with the segment's filter applied to event queries.
 */
export function SegmentFilter({ segments, selectedId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pickSegment = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('segment', id);
    } else {
      params.delete('segment');
    }
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  };

  const selected = segments.find(s => s.id === selectedId) ?? null;
  const label = selected ? selected.name : 'All users';

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-[#141414] hover:border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition-colors"
      >
        <Users className="h-4 w-4 text-zinc-500" />
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown className="h-3 w-3 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-60 rounded-lg border border-zinc-800 bg-[#1a1a1a] shadow-lg p-1">
          <button
            type="button"
            onClick={() => pickSegment(null)}
            className={cn(
              'w-full flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
              !selectedId ? 'text-white bg-zinc-800/50' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/30'
            )}
          >
            All users
            {!selectedId && <Check className="h-3.5 w-3.5" />}
          </button>
          {segments.length > 0 && <div className="border-t border-zinc-800/50 my-1" />}
          {segments.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => pickSegment(s.id)}
              className={cn(
                'w-full flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
                selectedId === s.id ? 'text-white bg-zinc-800/50' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/30'
              )}
            >
              <span className="truncate">{s.name}</span>
              {selectedId === s.id && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
          <div className="border-t border-zinc-800/50 my-1" />
          <Link
            href="/dashboard/segments"
            className="block px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={() => setOpen(false)}
          >
            Manage segments →
          </Link>
        </div>
      )}
    </div>
  );
}
