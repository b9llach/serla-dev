'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Copy, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createApiKey } from '@/lib/actions/api-keys';

interface Props {
  projectId: string;
}

type Scope = 'secret' | 'public';

export function CreateApiKeyDialog({ projectId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('secret');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await createApiKey(projectId, name, scope);
      if (result.success && result.key) {
        setCreatedKey(result.key);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to create API key');
      }
    });
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = () => {
    setOpen(false);
    setCreatedKey(null);
    setName('');
    setScope('secret');
    setCopied(false);
  };

  const handleOpenChange = (next: boolean) => {
    // Block dismissing while the plaintext is on screen - force "Done" so we
    // know they had a chance to copy it.
    if (!next && createdKey) return;
    if (!next) {
      setCreatedKey(null);
      setName('');
      setScope('secret');
      setCopied(false);
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create API key
        </Button>
      </DialogTrigger>
      <DialogContent>
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your API key</DialogTitle>
              <DialogDescription>
                This is the only time the full key will be shown. After you click Done, only the prefix will be visible.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-[#0a0a0a] rounded-lg text-sm font-mono break-all text-zinc-200 border border-zinc-800">
                  {createdKey}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {createdKey.startsWith('pk_live_') ? (
                    <>
                      This is a public key — safe to embed in browser or mobile code. It can send
                      events and read flags, but cannot export data.
                    </>
                  ) : (
                    <>
                      This is a secret key — keep it server-side only. Anyone with it can export
                      this project&apos;s raw event data. Save it somewhere safe; if you lose it,
                      revoke and create a new one.
                    </>
                  )}
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button onClick={handleDone}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                Give this key a name so you remember what it&apos;s for (e.g. &quot;Production server&quot;, &quot;Local dev&quot;, &quot;Mobile app&quot;).
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-2 py-2">
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Production server"
                  autoFocus
                  required
                  maxLength={100}
                />
              </div>

              <div className="space-y-2 py-2">
                <Label>Key type</Label>
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('secret')}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      scope === 'secret'
                        ? 'border-zinc-600 bg-zinc-800/50'
                        : 'border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-amber-400">sk_live_</code>
                      <span className="text-sm font-medium text-zinc-200">Secret</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Full access, including data export. Server-side only — never ship this to a browser.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('public')}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      scope === 'public'
                        ? 'border-zinc-600 bg-zinc-800/50'
                        : 'border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-green-400">pk_live_</code>
                      <span className="text-sm font-medium text-zinc-200">Public</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Send events and read feature flags only. Cannot export data, so it&apos;s safe in browser and mobile bundles.
                    </p>
                  </button>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !name.trim()}>
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create key'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
