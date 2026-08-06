'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Pencil, Trash2, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { revokeApiKey, renameApiKey } from '@/lib/actions/api-keys';
import { formatDateTime } from '@/lib/utils/date';
import type { ApiKey } from '@/lib/db/schema';

interface Props {
  keys: ApiKey[];
  canEdit: boolean;
}

export function ApiKeysTable({ keys, canEdit }: Props) {
  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <ApiKeyRow key={key.id} apiKey={key} canEdit={canEdit} />
      ))}
    </div>
  );
}

function ApiKeyRow({ apiKey, canEdit }: { apiKey: ApiKey; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(apiKey.name);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isRevoked = !!apiKey.revokedAt;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === apiKey.name) {
      setEditing(false);
      setName(apiKey.name);
      return;
    }
    startTransition(async () => {
      const result = await renameApiKey(apiKey.id, trimmed);
      if (result.success) {
        toast.success('Key renamed');
        setEditing(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to rename');
      }
    });
  };

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeApiKey(apiKey.id);
      if (result.success) {
        toast.success('API key revoked');
        setConfirmOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to revoke');
      }
    });
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg ${
        isRevoked ? 'bg-zinc-900/30 opacity-60' : 'bg-[#0a0a0a]'
      }`}
    >
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {editing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') {
                    setEditing(false);
                    setName(apiKey.name);
                  }
                }}
                autoFocus
                disabled={pending}
                maxLength={100}
                className="h-7 text-sm"
              />
              <Button size="icon" variant="ghost" onClick={handleSave} disabled={pending} className="h-7 w-7">
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setName(apiKey.name);
                }}
                disabled={pending}
                className="h-7 w-7"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <span className="font-medium truncate">{apiKey.name}</span>
              {apiKey.scope === 'public' ? (
                <Badge
                  variant="outline"
                  className="text-green-400 border-green-500/40 text-[10px]"
                  title="Write-only: can send events and read flags. Safe in browser code."
                >
                  Public
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-amber-400 border-amber-500/40 text-[10px]"
                  title="Full access including data export. Server-side only."
                >
                  Secret
                </Badge>
              )}
              {isRevoked ? (
                <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-[10px]">
                  Revoked
                </Badge>
              ) : (
                <Badge variant="outline" className="text-green-400 border-green-500/40 text-[10px]">
                  Active
                </Badge>
              )}
              {canEdit && !isRevoked && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditing(true)}
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
        <code className="block text-xs font-mono text-zinc-400 break-all">
          {apiKey.keyPrefix}...
        </code>
        <p className="text-xs text-muted-foreground">
          Created {formatDateTime(apiKey.createdAt)}
          {apiKey.lastUsedAt && <> · Last used {formatDateTime(apiKey.lastUsedAt)}</>}
          {isRevoked && apiKey.revokedAt && <> · Revoked {formatDateTime(apiKey.revokedAt)}</>}
        </p>
      </div>

      {canEdit && !isRevoked && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Revoke
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke {apiKey.name}?</DialogTitle>
              <DialogDescription>
                Any application using this key will immediately stop being able to send events or query the API. This is reversible only by creating a new key.
              </DialogDescription>
            </DialogHeader>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Make sure you&apos;ve already switched apps over to a different key before revoking.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRevoke} disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Revoking...
                  </>
                ) : (
                  'Revoke key'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
