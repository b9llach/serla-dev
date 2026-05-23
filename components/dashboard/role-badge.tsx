import { Eye, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectRole } from '@/lib/utils/project';

interface Props {
  role: ProjectRole;
  className?: string;
}

export function RoleBadge({ role, className }: Props) {
  if (role === 'owner') return null;
  const Icon = role === 'editor' ? Pencil : Eye;
  const label = role === 'editor' ? 'Editor' : 'Read-only';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider',
        role === 'viewer'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
          : 'border-zinc-700 bg-zinc-800/50 text-zinc-400',
        className,
      )}
      title={
        role === 'viewer'
          ? 'You have read-only access to this project'
          : 'You can edit content but cannot manage members'
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
