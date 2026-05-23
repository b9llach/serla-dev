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
import { createAlert } from '@/lib/actions/alerts';
import { toast } from 'sonner';

type Metric = 'events' | 'users' | 'sessions' | 'event_count';
type Comparator = 'gt' | 'lt';
type WindowSize = '24h' | '7d';

interface AlertDialogProps {
  projectId: string;
  projectWebhooks: Array<{ id: string; name: string }>;
  defaultEmail: string;
  children: ReactNode;
}

export function AlertDialog({
  projectId,
  projectWebhooks,
  defaultEmail,
  children,
}: AlertDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState<Metric>('events');
  const [comparator, setComparator] = useState<Comparator>('gt');
  const [windowSize, setWindowSize] = useState<WindowSize>('24h');
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookId, setWebhookId] = useState<string>('');
  const [emailValue, setEmailValue] = useState<string>(defaultEmail);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!emailEnabled && !webhookEnabled) {
      toast.error('Choose at least one delivery channel (email or webhook)');
      return;
    }
    if (webhookEnabled && !webhookId) {
      toast.error('Select a webhook to notify');
      return;
    }
    if (emailEnabled && !emailValue.trim()) {
      toast.error('Email address is required');
      return;
    }

    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set('projectId', projectId);
    formData.set('metric', metric);
    formData.set('comparator', comparator);
    formData.set('windowSize', windowSize);
    if (emailEnabled) {
      formData.set('notifyEmail', emailValue.trim());
    } else {
      formData.set('notifyEmail', '');
    }
    if (webhookEnabled && webhookId) {
      formData.set('webhookId', webhookId);
    } else {
      formData.set('webhookId', '');
    }

    const result = await createAlert(formData);
    setLoading(false);

    if (!result.success) {
      toast.error(result.error || 'Failed to create alert');
      return;
    }

    setOpen(false);
    toast.success('Alert created successfully');
    router.refresh();
  };

  const resetState = () => {
    setMetric('events');
    setComparator('gt');
    setWindowSize('24h');
    setEmailEnabled(true);
    setWebhookEnabled(false);
    setWebhookId('');
    setEmailValue(defaultEmail);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetState();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Alert</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Alert Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., High traffic spike"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="metric">Metric</Label>
              <Select
                value={metric}
                onValueChange={(v) => setMetric(v as Metric)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="events">Events</SelectItem>
                  <SelectItem value="users">Unique users</SelectItem>
                  <SelectItem value="sessions">Sessions</SelectItem>
                  <SelectItem value="event_count">
                    Specific event count
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {metric === 'event_count' && (
              <div className="space-y-2">
                <Label htmlFor="eventName">Event Name</Label>
                <Input
                  id="eventName"
                  name="eventName"
                  placeholder="e.g., signup_completed"
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="comparator">Condition</Label>
                <Select
                  value={comparator}
                  onValueChange={(v) => setComparator(v as Comparator)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater than (gt)</SelectItem>
                    <SelectItem value="lt">Less than (lt)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="threshold">Threshold</Label>
                <Input
                  id="threshold"
                  name="threshold"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1000"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="windowSize">Window</Label>
              <Select
                value={windowSize}
                onValueChange={(v) => setWindowSize(v as WindowSize)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border border-zinc-800 p-3">
              <Label className="text-sm font-medium">Notify me by</Label>

              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded accent-zinc-300"
                  />
                  <div className="flex-1 space-y-1">
                    <span className="text-sm">Email</span>
                    <Input
                      type="email"
                      value={emailValue}
                      onChange={(e) => setEmailValue(e.target.value)}
                      disabled={!emailEnabled}
                      placeholder="you@example.com"
                    />
                  </div>
                </label>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={webhookEnabled}
                    onChange={(e) => setWebhookEnabled(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded accent-zinc-300"
                    disabled={projectWebhooks.length === 0}
                  />
                  <div className="flex-1 space-y-1">
                    <span className="text-sm">
                      Webhook
                      {projectWebhooks.length === 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (no webhooks configured)
                        </span>
                      )}
                    </span>
                    <Select
                      value={webhookId}
                      onValueChange={setWebhookId}
                      disabled={
                        !webhookEnabled || projectWebhooks.length === 0
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a webhook" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectWebhooks.map((wh) => (
                          <SelectItem key={wh.id} value={wh.id}>
                            {wh.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Alert'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
