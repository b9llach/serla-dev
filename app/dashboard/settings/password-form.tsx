'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrength } from '@/components/ui/password-strength';
import { Loader2 } from 'lucide-react';
import { changePassword } from '@/lib/actions/settings';
import { toast } from 'sonner';
import { useEffect } from 'react';

export function PasswordChangeForm() {
  const [state, formAction, isPending] = useActionState(changePassword, undefined);
  const [newPassword, setNewPassword] = useState('');

  // Clear the field (and with it the strength meter) once the server action
  // reports success. Adjusted during render with a previous-value guard -
  // React's documented alternative to calling setState inside an effect,
  // which costs an extra render pass.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state?.success) setNewPassword('');
  }

  // The toast is a genuine side effect, so it stays in an effect.
  useEffect(() => {
    if (state?.success) {
      toast.success('Password changed');
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <PasswordInput
            id="currentPassword"
            name="currentPassword"
            required
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <PasswordInput
            id="newPassword"
            name="newPassword"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {newPassword && <PasswordStrength password={newPassword} />}
        </div>
      </div>
      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Update password
        </Button>
      </div>
    </form>
  );
}
