'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { toggleFlag } from '@/lib/actions/flags';
import { toast } from 'sonner';

interface Props {
  flagId: string;
  enabled: boolean;
}

export function FlagToggle({ flagId, enabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleChange = () => {
    startTransition(async () => {
      const result = await toggleFlag(flagId);
      if (result.success) {
        toast.success(enabled ? 'Flag disabled' : 'Flag enabled');
        router.refresh();
      } else {
        toast.error('Failed to toggle flag');
      }
    });
  };

  return <Switch checked={enabled} onCheckedChange={handleChange} disabled={pending} />;
}
