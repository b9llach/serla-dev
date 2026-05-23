'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, KeyRound, Sparkles, X, Loader2, Code2, ArrowRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  dismissOnboarding,
  generateSampleData,
  clearSampleData,
} from '@/lib/actions/onboarding';

interface Props {
  projectId: string;
  /** Most recent active key's prefix, or null when the project has no keys yet. */
  apiKeyPrefix: string | null;
  /** Wall-clock count of real (non-sample) events on this project. */
  realEventsCount: number;
  /** Count of sample events; > 0 means sample data is present. */
  sampleEventsCount: number;
  host: string;
}

type FrameworkId = 'browser' | 'react' | 'node' | 'python' | 'go' | 'curl';

const FRAMEWORKS: Array<{ id: FrameworkId; label: string }> = [
  { id: 'browser', label: 'Browser' },
  { id: 'react', label: 'React' },
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
  { id: 'curl', label: 'cURL' },
];

function snippetFor(fw: FrameworkId, host: string, apiKey: string): string {
  switch (fw) {
    case 'browser':
      return `npm install serla-js

import { Serla } from 'serla-js';

Serla.init({
  apiKey: '${apiKey}',
  host: '${host}',
  autoPageviews: true,
});

Serla.track('signup_completed', { plan: 'pro' });`;
    case 'react':
      return `npm install serla-js serla-js-react

import { SerlaProvider, useTrack } from 'serla-js-react';

<SerlaProvider config={{ apiKey: '${apiKey}', host: '${host}' }}>
  <App />
</SerlaProvider>

// in any component:
const track = useTrack('cta_clicked');
<button onClick={() => track({ variant: 'hero' })}>Click</button>`;
    case 'node':
      return `npm install serla-node

import { Serla } from 'serla-node';

const serla = new Serla({
  apiKey: '${apiKey}',
  host: '${host}',
});

serla.track({
  name: 'signup_completed',
  distinctId: 'user_123',
  properties: { plan: 'pro' },
});

await serla.flush(); // before serverless return`;
    case 'python':
      return `pip install serla-py

from serla import Serla

serla = Serla(
    api_key="${apiKey}",
    host="${host}",
)

serla.track(
    event="signup_completed",
    distinct_id="user_123",
    properties={"plan": "pro"},
)`;
    case 'go':
      return `go get github.com/b9llach/serla-go

import serla "github.com/b9llach/serla-go"

client, _ := serla.New(serla.Config{
    APIKey: "${apiKey}",
    Host:   "${host}",
})
defer client.Shutdown(ctx)

client.Track(serla.Event{
    Name:       "signup_completed",
    DistinctID: "user_123",
    Properties: map[string]any{"plan": "pro"},
})`;
    case 'curl':
      return `curl -X POST ${host}/api/v1/events \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "signup_completed",
    "distinctId": "user_123",
    "properties": { "plan": "pro" }
  }'`;
  }
}

export function OnboardingWizard({
  projectId,
  apiKeyPrefix,
  realEventsCount,
  sampleEventsCount,
  host,
}: Props) {
  const router = useRouter();
  const [framework, setFramework] = useState<FrameworkId>('browser');
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const [eventArrived, setEventArrived] = useState(realEventsCount > 0);
  const [, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<'sample' | 'clear' | 'dismiss' | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // If no key exists yet, snippets use a placeholder; the user is sent to the
  // API keys page via the in-step CTA below to mint one first.
  const snippet = snippetFor(framework, host, apiKeyPrefix ? `${apiKeyPrefix}...` : 'YOUR_API_KEY');
  const hasSampleData = sampleEventsCount > 0;

  const copy = () => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // Poll the dashboard for first event arrival once the user starts watching.
  // Stops itself as soon as a real event lands.
  useEffect(() => {
    if (!polling || eventArrived) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/dashboard/events/poll?since=' + new Date(Date.now() - 60_000).toISOString());
        if (!res.ok) return;
        const data = await res.json();
        const realEvents = (data.events as Array<{ properties?: { isSample?: boolean } }>).filter(
          e => !e.properties?.isSample,
        );
        if (realEvents.length > 0) {
          setEventArrived(true);
          setPolling(false);
          toast.success('First event received!');
        }
      } catch {
        // Network blip - keep trying.
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [polling, eventArrived]);

  // Refresh the page once a real event arrives so the dashboard takes over.
  useEffect(() => {
    if (eventArrived && realEventsCount === 0) {
      // Give the success state a beat to read, then redirect to populated dashboard.
      const t = setTimeout(() => router.refresh(), 1500);
      return () => clearTimeout(t);
    }
  }, [eventArrived, realEventsCount, router]);

  const handleSampleData = () => {
    setBusyAction('sample');
    startTransition(async () => {
      const result = await generateSampleData(projectId);
      setBusyAction(null);
      if (result.success) {
        toast.success(`Generated ${result.count} sample events`);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to generate sample data');
      }
    });
  };

  const handleClearSample = () => {
    setBusyAction('clear');
    startTransition(async () => {
      const result = await clearSampleData(projectId);
      setBusyAction(null);
      if (result.success) {
        toast.success(`Removed ${result.count} sample events`);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to clear sample data');
      }
    });
  };

  const handleDismiss = () => {
    setBusyAction('dismiss');
    startTransition(async () => {
      await dismissOnboarding();
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-1">
                Get your first event flowing
              </h2>
              <p className="text-sm text-zinc-400">
                Pick an SDK, paste the snippet into your app, and watch events arrive in real time.
              </p>
            </div>
            <button
              onClick={handleDismiss}
              disabled={busyAction === 'dismiss'}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -m-1"
              title="Dismiss"
              aria-label="Dismiss onboarding"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Step 1: Install */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-500/15 text-blue-400 text-xs font-medium">
                1
              </div>
              <h3 className="text-sm font-medium text-zinc-200">Install</h3>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FRAMEWORKS.map(fw => (
                <button
                  key={fw.id}
                  onClick={() => setFramework(fw.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs transition-colors',
                    framework === fw.id
                      ? 'bg-zinc-700 text-white'
                      : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                  )}
                >
                  {fw.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <pre className="bg-[#0a0a0a] rounded-xl p-4 text-xs font-mono overflow-x-auto text-zinc-300 leading-relaxed">
                {snippet}
              </pre>
              <button
                onClick={copy}
                className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-zinc-800/80 hover:bg-zinc-700 px-2 py-1 text-[10px] text-zinc-300 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Code2 className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" />
              {apiKeyPrefix ? (
                <>
                  Replace <code className="text-zinc-400">{apiKeyPrefix}...</code> with the full key.{' '}
                  <Link href="/dashboard/settings/api-keys" className="underline hover:text-zinc-300">
                    Settings → API Keys
                  </Link>
                  .
                </>
              ) : (
                <>
                  No API key yet —{' '}
                  <Link href="/dashboard/settings/api-keys" className="underline hover:text-zinc-300">
                    create one
                  </Link>{' '}
                  before sending events.
                </>
              )}
            </p>
          </section>

          {/* Step 2: Wait for event */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={cn(
                'flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium',
                eventArrived ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/15 text-blue-400',
              )}>
                {eventArrived ? <Check className="h-3 w-3" /> : '2'}
              </div>
              <h3 className="text-sm font-medium text-zinc-200">
                {eventArrived ? 'First event received!' : 'Send your first event'}
              </h3>
            </div>

            {!eventArrived && (
              <div className="flex items-center gap-3">
                {polling ? (
                  <div className="inline-flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Waiting for events from your app...
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPolling(true)}
                  >
                    <ArrowRight className="h-4 w-4 mr-1.5" />
                    I sent an event - check now
                  </Button>
                )}
              </div>
            )}

            {eventArrived && (
              <p className="text-sm text-green-400">
                Your dashboard will populate as more events arrive. Refreshing soon...
              </p>
            )}
          </section>

          {/* Step 3: Sample data (optional) */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium">
                3
              </div>
              <h3 className="text-sm font-medium text-zinc-200">
                Try with sample data <span className="text-xs text-zinc-500 font-normal">(optional)</span>
              </h3>
            </div>
            <p className="text-xs text-zinc-500">
              Generates 500 fake events spread across the past 30 days so you can see what funnels, retention, and the dashboard look like populated. Sample events are tagged and can be cleared in one click.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {!hasSampleData ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSampleData}
                  disabled={busyAction === 'sample'}
                >
                  {busyAction === 'sample' ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Generate sample data
                </Button>
              ) : (
                <>
                  <span className="text-xs text-zinc-400">
                    {sampleEventsCount.toLocaleString()} sample events present.
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleClearSample}
                    disabled={busyAction === 'clear'}
                    className="text-zinc-400"
                  >
                    {busyAction === 'clear' ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Clear sample data
                  </Button>
                </>
              )}
            </div>
          </section>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/50">
            <div className="flex items-center gap-3">
              <Link
                href="/docs"
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Full docs →
              </Link>
              <Link
                href="/dashboard/settings/api-keys"
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                API keys →
              </Link>
            </div>
            <button
              onClick={handleDismiss}
              disabled={busyAction === 'dismiss'}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Dismiss this guide
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
