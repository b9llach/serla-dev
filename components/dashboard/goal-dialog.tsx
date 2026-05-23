'use client';

import { useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createGoal } from '@/lib/actions/goals';
import { toast } from 'sonner';

interface GoalDialogProps {
  projectId: string;
  children: ReactNode;
}

export function GoalDialog({ projectId, children }: GoalDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'event' | 'pageview'>('event');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set('projectId', projectId);
    formData.set('type', type);

    await createGoal(formData);
    setLoading(false);
    setOpen(false);
    toast.success('Goal created successfully');
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Goal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Goal Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Sign Up Completed"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Goal Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'event' | 'pageview')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="pageview">Pageview</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === 'event' ? (
              <div className="space-y-2">
                <Label htmlFor="eventName">Event Name</Label>
                <Input
                  id="eventName"
                  name="eventName"
                  placeholder="e.g., signup_completed"
                  required
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="pagePathPattern">Page Path Pattern</Label>
                <Input
                  id="pagePathPattern"
                  name="pagePathPattern"
                  placeholder="e.g., /thank-you or /checkout/*"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Use * as wildcard for matching multiple paths
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="value">Value per Conversion (optional)</Label>
              <Input
                id="value"
                name="value"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g., 9.99"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Goal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
