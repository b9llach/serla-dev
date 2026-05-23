'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { deleteOwnAccount } from '@/lib/actions/settings';
import { toast } from 'sonner';

interface Props {
  email: string;
}

export function DeleteAccountForm({ email }: Props) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = confirmation === email && password.length >= 8 && !isPending;

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('confirmation', confirmation);
      formData.set('password', password);
      const result = await deleteOwnAccount(formData).catch(() => null);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      }
      // On success the action redirects via redirect('/'), no need to handle.
    });
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">Delete account</p>
        <p className="text-sm text-muted-foreground">
          Soft-deletes immediately. You have 30 days to contact support to restore before data is permanently deleted.
        </p>
      </div>
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setConfirmation('');
            setPassword('');
            setError(null);
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            className="active:scale-[0.98] transition-transform"
          >
            Delete account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              All projects, events, and webhooks tied to this account will be
              hard-deleted in 30 days. To confirm, type your email and enter
              your current password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="confirmation" className="text-xs">
                Type <span className="font-mono text-foreground">{email}</span> to confirm
              </Label>
              <Input
                id="confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={email}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deletePassword" className="text-xs">Current password</Label>
              <PasswordInput
                id="deletePassword"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={!canSubmit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete account permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
