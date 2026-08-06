'use client';

import { useState, useTransition, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { createFlag, updateFlag, deleteFlag } from '@/lib/actions/flags';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';
import type { FeatureFlag } from '@/lib/db/schema';

interface Variant {
  key: string;
  weight: number;
}

interface Props {
  projectId: string;
  flag?: FeatureFlag;
  children: ReactNode;
}

export function FlagDialog({ projectId, flag, children }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = !!flag;

  const [enabled, setEnabled] = useState(flag?.enabled ?? false);
  const [rolloutPercentage, setRolloutPercentage] = useState(flag?.rolloutPercentage ?? 100);
  const initialVariants: Variant[] = Array.isArray(flag?.variants)
    ? (flag.variants as Variant[])
    : [];
  const [variants, setVariants] = useState<Variant[]>(initialVariants);

  // Re-sync form state whenever the dialog transitions closed -> open, so
  // reopening on a different flag doesn't show the previous flag's values.
  // Done in the open handler rather than an effect: it's a response to a
  // user event, so there's no need to render once with stale values first.
  const openDialog = () => {
    if (flag) {
      setEnabled(flag.enabled);
      setRolloutPercentage(flag.rolloutPercentage);
      setVariants(Array.isArray(flag.variants) ? (flag.variants as Variant[]) : []);
    }
    setOpen(true);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) openDialog();
    else setOpen(false);
  };

  const addVariant = () => {
    setVariants(prev => [...prev, { key: `variant_${prev.length + 1}`, weight: 0 }]);
  };

  const removeVariant = (index: number) => {
    setVariants(prev => prev.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, patch: Partial<Variant>) => {
    setVariants(prev => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('projectId', projectId);
    formData.set('enabled', enabled ? 'on' : 'off');
    formData.set('rolloutPercentage', String(rolloutPercentage));
    formData.set('variants', JSON.stringify(variants));

    startTransition(async () => {
      const result = isEdit
        ? await updateFlag(flag.id, formData)
        : await createFlag(formData);
      if (result.success) {
        toast.success(isEdit ? 'Flag updated' : 'Flag created');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Operation failed');
      }
    });
  };

  const handleDelete = () => {
    if (!isEdit) return;
    if (!confirm(`Delete flag "${flag.key}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteFlag(flag.id);
      toast.success('Flag deleted');
      setOpen(false);
      router.refresh();
    });
  };

  const totalVariantWeight = variants.reduce((s, v) => s + Number(v.weight || 0), 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit flag' : 'New flag'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                name="key"
                placeholder="new-checkout-flow"
                defaultValue={flag?.key}
                required
                disabled={isEdit}
              />
              <p className="text-[10px] text-zinc-500">Stable identifier used in code. Cannot be changed later.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="New checkout flow"
                defaultValue={flag?.name}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="What this flag controls and when it's safe to remove"
              defaultValue={flag?.description || ''}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-zinc-200">Enabled</p>
              <p className="text-xs text-zinc-500">If off, the flag returns false for everyone regardless of rollout.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="rolloutPercentage">Rollout percentage</Label>
              <span className="text-sm font-mono text-zinc-300">{rolloutPercentage}%</span>
            </div>
            <input
              id="rolloutPercentage"
              type="range"
              min={0}
              max={100}
              step={1}
              value={rolloutPercentage}
              onChange={e => setRolloutPercentage(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <p className="text-[10px] text-zinc-500">
              Each user is bucketed deterministically by distinct_id, so they always see the same value as long as rollout doesn&apos;t shrink past their bucket.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Variants (optional)</Label>
              <Button type="button" size="sm" variant="ghost" onClick={addVariant} className="text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add variant
              </Button>
            </div>
            {variants.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No variants - this is a boolean flag (on or off).
              </p>
            ) : (
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={v.key}
                      onChange={e => updateVariant(i, { key: e.target.value })}
                      placeholder="variant_a"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={v.weight}
                      onChange={e => updateVariant(i, { weight: Number(e.target.value) })}
                      placeholder="50"
                      className="w-24"
                    />
                    <span className="text-xs text-zinc-500">%</span>
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeVariant(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <p className={`text-[10px] ${Math.abs(totalVariantWeight - 100) > 0.01 ? 'text-red-400' : 'text-zinc-500'}`}>
                  Weights total: {totalVariantWeight}% {Math.abs(totalVariantWeight - 100) > 0.01 ? '(must sum to 100)' : ''}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between flex-wrap gap-2">
            <div>
              {isEdit && (
                <Button type="button" variant="ghost" onClick={handleDelete} disabled={pending} className="text-red-400">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>
                {isEdit ? 'Save' : 'Create'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
