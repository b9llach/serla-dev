'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Loader2, Trash2 } from 'lucide-react';
import { removeMember, changeRole, revokeInvite } from '@/lib/actions/members';
import type { ProjectRole } from '@/lib/utils/project';

interface MemberActionsProps {
  projectId: string;
  memberId: string; // user_id of the member
  memberEmail: string;
  currentRole: ProjectRole;
  // Disable role change / remove on this row (e.g. it's the only owner left
  // or it's the current viewer). The parent decides; we just render.
  canChangeRole: boolean;
  canRemove: boolean;
}

export function MemberActions({
  projectId,
  memberId,
  memberEmail,
  currentRole,
  canChangeRole,
  canRemove,
}: MemberActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRoleChange = (newRole: string) => {
    if (newRole === currentRole) return;
    startTransition(async () => {
      const result = await changeRole(
        projectId,
        memberId,
        newRole as ProjectRole
      ).catch(() => null);
      if (!result || !result.success) {
        toast.error(result?.error || 'Failed to update role');
        return;
      }
      toast.success('Role updated');
      router.refresh();
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      const result = await removeMember(projectId, memberId).catch(() => null);
      if (!result || !result.success) {
        toast.error(result?.error || 'Failed to remove member');
        return;
      }
      toast.success(`${memberEmail} removed from project`);
      setConfirmOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentRole}
        onValueChange={handleRoleChange}
        disabled={!canChangeRole || isPending}
      >
        <SelectTrigger size="sm" className="w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="owner">Owner</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
        </SelectContent>
      </Select>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            disabled={!canRemove || isPending}
            title="Remove member"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {memberEmail}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will immediately lose access to this project. You can
              re-invite them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRemove();
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove member'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface RevokeInviteButtonProps {
  inviteId: string;
  email: string;
}

export function RevokeInviteButton({ inviteId, email }: RevokeInviteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeInvite(inviteId).catch(() => null);
      if (!result || !result.success) {
        toast.error(result?.error || 'Failed to revoke invite');
        return;
      }
      toast.success(`Invite to ${email} revoked`);
      router.refresh();
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleRevoke}
      disabled={isPending}
      className="text-muted-foreground hover:text-destructive"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        'Revoke'
      )}
    </Button>
  );
}
