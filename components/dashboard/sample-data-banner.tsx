'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { clearSampleData } from '@/lib/actions/onboarding';

interface Props {
  projectId: string;
  sampleEventsCount: number;
  realEventsCount: number;
}

export function SampleDataBanner({ projectId, sampleEventsCount, realEventsCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClear = () => {
    startTransition(async () => {
      const result = await clearSampleData(projectId);
      if (result.success) {
        toast.success(`Removed ${result.count} sample events`);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to clear sample data');
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="text-amber-200 truncate">
          {sampleEventsCount.toLocaleString()} sample events are mixed into this dashboard
          {realEventsCount > 0 && ` (alongside ${realEventsCount.toLocaleString()} real events)`}.
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleClear}
        disabled={pending}
        className="text-amber-200 hover:text-amber-100 shrink-0"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        )}
        Clear
      </Button>
    </div>
  );
}
