'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserPlus } from 'lucide-react';
import { inviteMember } from '@/lib/actions/members';

interface InviteFormProps {
  projectId: string;
}

export function InviteForm({ projectId }: InviteFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Enter an email address');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('email', trimmed);
      formData.set('role', role);

      const result = await inviteMember(formData).catch(() => null);
      if (!result || !result.success) {
        toast.error(result?.error || 'Failed to send invite');
        return;
      }
      toast.success(`Invite sent to ${trimmed}`);
      setEmail('');
      setRole('viewer');
      formRef.current?.reset();
      router.refresh();
    });
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="invite-email" className="text-xs text-muted-foreground">
          Email address
        </Label>
        <Input
          id="invite-email"
          type="email"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5 sm:w-40">
        <Label htmlFor="invite-role" className="text-xs text-muted-foreground">
          Role
        </Label>
        <Select value={role} onValueChange={(v) => setRole(v as 'editor' | 'viewer')}>
          <SelectTrigger id="invite-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending} className="sm:self-end">
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <UserPlus className="mr-2 h-4 w-4" />
            Send invite
          </>
        )}
      </Button>
    </form>
  );
}
