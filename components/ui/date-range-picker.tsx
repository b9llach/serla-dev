'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';

/**
 * URL-search-param-backed date range picker.
 *
 * Reads `from` and `to` from the current URL (YYYY-MM-DD). Writing a preset
 * or custom range pushes a new URL so refresh and share preserve the range.
 *
 * Use parseRangeFromSearchParams() server-side to materialise the dates.
 */

const PRESETS = [
  { id: '24h', label: 'Last 24 hours', days: 1 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: '365d', label: 'Last 12 months', days: 365 },
] as const;

interface Props {
  /** Default preset id when the URL has no from/to params. */
  defaultPreset?: typeof PRESETS[number]['id'];
}

export function DateRangePicker({ defaultPreset = '7d' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  // Close popover on outside click.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyPreset = (days: number) => {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    pushRange(from, to);
  };

  const applyCustom = (from: Date | undefined, to: Date | undefined) => {
    if (from && to) pushRange(from, to);
    else if (from && !to) pushRange(from, new Date());
  };

  const pushRange = (from: Date, to: Date) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', format(from, 'yyyy-MM-dd'));
    params.set('to', format(to, 'yyyy-MM-dd'));
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  };

  const label = currentLabel(fromParam, toParam, defaultPreset);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-[#141414] hover:border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition-colors"
      >
        <CalendarRange className="h-4 w-4 text-zinc-500" />
        {label}
        <ChevronDown className="h-3 w-3 text-zinc-500" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-72 rounded-lg border border-zinc-800 bg-[#1a1a1a] shadow-lg p-2">
          <div className="space-y-0.5">
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.days)}
                className={cn(
                  'w-full text-left rounded-md px-3 py-1.5 text-sm transition-colors',
                  'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="border-t border-zinc-800/50 mt-2 pt-2">
            <div className="text-xs text-zinc-500 px-3 mb-2">Custom range</div>
            <div className="flex flex-col gap-2 px-1">
              <DatePicker
                value={fromParam ? new Date(fromParam) : undefined}
                onChange={(d) => applyCustom(d, toParam ? new Date(toParam) : undefined)}
                placeholder="From"
                className="w-full"
              />
              <DatePicker
                value={toParam ? new Date(toParam) : undefined}
                onChange={(d) => applyCustom(fromParam ? new Date(fromParam) : undefined, d)}
                placeholder="To"
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function currentLabel(from: string | null, to: string | null, defaultPreset: string): string {
  if (!from && !to) {
    const preset = PRESETS.find(p => p.id === defaultPreset);
    return preset?.label ?? 'Last 7 days';
  }
  // Check if the from/to match a preset's range.
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    const preset = PRESETS.find(p => p.days === days);
    if (preset) return preset.label;
    return `${format(fromDate, 'MMM d')} – ${format(toDate, 'MMM d, yyyy')}`;
  }
  return 'Custom';
}
