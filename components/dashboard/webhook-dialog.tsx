'use client';

import { useState, ReactNode, useEffect } from 'react';
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
import { createWebhook, testWebhookUrl, getProjectEventNames } from '@/lib/actions/webhooks';
import { WebhookType, getWebhookTypeInfo } from '@/lib/webhooks/formatters';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Webhook, Send, Check, X } from 'lucide-react';

interface WebhookDialogProps {
  projectId: string;
  children: ReactNode;
}

interface TestResult {
  ok: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
}

const WEBHOOK_TYPES: { type: WebhookType; icon: React.ReactNode }[] = [
  { type: 'raw', icon: <Webhook className="h-5 w-5" /> },
  { type: 'discord', icon: <DiscordIcon className="h-5 w-5" /> },
  { type: 'slack', icon: <SlackIcon className="h-5 w-5" /> },
  { type: 'teams', icon: <TeamsIcon className="h-5 w-5" /> },
];

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  );
}

function TeamsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.625 8.073h-5.27V5.073a1.667 1.667 0 0 0-1.666-1.667H8.31a1.667 1.667 0 0 0-1.667 1.667v3H1.375a1.125 1.125 0 0 0-1.125 1.125v9.5A1.125 1.125 0 0 0 1.375 19.823h19.25a1.125 1.125 0 0 0 1.125-1.125v-9.5a1.125 1.125 0 0 0-1.125-1.125zM8.31 5.073h5.38v3H8.31v-3zm5.38 12.75H8.31v-3h5.38v3z"/>
      <circle cx="18.5" cy="4.5" r="2.5"/>
    </svg>
  );
}

export function WebhookDialog({ projectId, children }: WebhookDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [selectedType, setSelectedType] = useState<WebhookType>('raw');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [eventListOpen, setEventListOpen] = useState(false);

  const typeInfo = getWebhookTypeInfo(selectedType);

  // Load available event names when the dialog opens so the filter multiselect
  // has real options to choose from.
  useEffect(() => {
    if (open && availableEvents.length === 0) {
      getProjectEventNames(projectId).then(setAvailableEvents).catch(() => {});
    }
  }, [open, projectId, availableEvents.length]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testWebhookUrl(url, selectedType, projectId);
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const toggleEvent = (name: string) => {
    setSelectedEvents(prev =>
      prev.includes(name) ? prev.filter(e => e !== name) : [...prev, name]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set('projectId', projectId);
    formData.set('type', selectedType);
    formData.set('events', selectedEvents.join(','));

    await createWebhook(formData);
    setLoading(false);
    setOpen(false);
    setTestResult(null);
    setSelectedEvents([]);
    setUrl('');
    toast.success('Webhook created successfully');
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Webhook</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Integration Type Selection */}
            <div className="space-y-2">
              <Label>Integration Type</Label>
              <div className="grid grid-cols-4 gap-2">
                {WEBHOOK_TYPES.map(({ type, icon }) => {
                  const info = getWebhookTypeInfo(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedType(type)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors',
                        selectedType === type
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300'
                      )}
                    >
                      {icon}
                      <span className="text-xs font-medium">{info.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {typeInfo.description}
              </p>
            </div>

            {/* Webhook Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder={`My ${typeInfo.label}`}
                defaultValue=""
              />
            </div>

            {/* Webhook URL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="url">Webhook URL</Label>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={!url || testing}
                  className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Send className="h-3 w-3" />
                  {testing ? 'Sending test...' : 'Send test event'}
                </button>
              </div>
              <Input
                id="url"
                name="url"
                type="url"
                placeholder={typeInfo.placeholder}
                required
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTestResult(null);
                }}
              />
              {testResult && (
                <div
                  className={cn(
                    'rounded-md border p-2 text-xs space-y-1',
                    testResult.ok
                      ? 'border-green-500/40 bg-green-500/10 text-green-300'
                      : 'border-red-500/40 bg-red-500/10 text-red-300'
                  )}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    {testResult.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {testResult.error
                      ? testResult.error
                      : `Response ${testResult.statusCode}`}
                  </div>
                  {testResult.responseBody && (
                    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all opacity-80">
                      {testResult.responseBody}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* Event Filter - multiselect of observed event names */}
            <div className="space-y-2 relative">
              <Label>Event Filter (optional)</Label>
              <button
                type="button"
                onClick={() => setEventListOpen(o => !o)}
                className="w-full text-left rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm hover:border-zinc-700 transition-colors"
              >
                {selectedEvents.length === 0 ? (
                  <span className="text-muted-foreground">All events</span>
                ) : (
                  <span className="text-zinc-200">
                    {selectedEvents.length} event{selectedEvents.length === 1 ? '' : 's'} selected
                  </span>
                )}
              </button>
              {eventListOpen && (
                <div className="absolute z-10 w-full mt-1 max-h-56 overflow-auto rounded-md border border-zinc-800 bg-[#1a1a1a] shadow-lg">
                  {availableEvents.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No events received yet. Leave empty to match all events.
                    </div>
                  ) : (
                    availableEvents.map(name => (
                      <label
                        key={name}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-800/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(name)}
                          onChange={() => toggleEvent(name)}
                          className="h-3.5 w-3.5 rounded accent-zinc-300"
                        />
                        <span className="truncate">{name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Leave empty to receive all events
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Webhook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
