'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { toast } from 'sonner';
import { updateProject, deleteProject, updateUser } from '@/lib/actions/settings';
import { Loader2, AlertTriangle } from 'lucide-react';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
];

// Retention options by plan
const RETENTION_BY_PLAN: Record<string, { value: string; label: string }[]> = {
  free: [
    { value: '7', label: '7 days' },
  ],
  hobby: [
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '60', label: '60 days' },
    { value: '90', label: '90 days' },
  ],
  pro: [
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '60', label: '60 days' },
    { value: '90', label: '90 days' },
    { value: '180', label: '180 days' },
    { value: '365', label: '1 year' },
  ],
  max: [
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '60', label: '60 days' },
    { value: '90', label: '90 days' },
    { value: '180', label: '180 days' },
    { value: '365', label: '1 year' },
    { value: '730', label: '2 years' },
    { value: '1095', label: '3 years' },
  ],
};

interface UserFormData {
  name: string;
  email: string;
  plan: string;
  weeklyDigestEnabled: boolean;
}

interface ProjectFormData {
  name: string;
  domain: string;
  timezone: string;
  retentionDays: number;
}

interface SettingsFormProps {
  type: 'user' | 'project' | 'delete';
  projectId?: string;
  projectName?: string;
  userPlan?: string;
  readOnly?: boolean;
  initialData?: UserFormData | ProjectFormData;
}

export function SettingsForm({ type, projectId, projectName, userPlan = 'free', readOnly = false, initialData }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (type === 'user' && initialData && 'email' in initialData) {
    const data = initialData as UserFormData;

    const handleSubmit = async (formData: FormData) => {
      startTransition(async () => {
        try {
          await updateUser(formData);
          toast.success('Account settings saved');
          router.refresh();
        } catch {
          toast.error('Failed to save settings');
        }
      });
    };

    return (
      <form action={handleSubmit}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={data.name}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={data.email}
                disabled
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{data.plan}</Badge>
            <span className="text-sm text-muted-foreground">Current plan</span>
          </div>
          <div className="flex items-start gap-3 pt-2">
            <input
              type="checkbox"
              id="weeklyDigestEnabled"
              name="weeklyDigestEnabled"
              defaultChecked={data.weeklyDigestEnabled}
              className="h-4 w-4 mt-0.5 rounded border-zinc-700 bg-transparent accent-zinc-300"
            />
            <div className="space-y-0.5">
              <Label htmlFor="weeklyDigestEnabled" className="text-sm cursor-pointer">
                Weekly digest email
              </Label>
              <p className="text-xs text-muted-foreground">
                Get a Monday summary of last week&apos;s events, top events, and growth across all your projects.
              </p>
            </div>
          </div>
          <div className="pt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="active:scale-[0.98] transition-transform"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    );
  }

  if (type === 'project' && initialData && 'timezone' in initialData) {
    const data = initialData as ProjectFormData;
    const retentionOptions = RETENTION_BY_PLAN[userPlan] || RETENTION_BY_PLAN.free;

    // Ensure current retention is valid for plan, otherwise use lowest
    const currentRetention = String(data.retentionDays);
    const isRetentionValid = retentionOptions.some(opt => opt.value === currentRetention);
    const defaultRetention = isRetentionValid ? currentRetention : retentionOptions[0].value;

    const handleSubmit = async (formData: FormData) => {
      startTransition(async () => {
        try {
          await updateProject(formData);
          toast.success('Project settings saved');
          router.refresh();
        } catch {
          toast.error('Failed to save settings');
        }
      });
    };

    if (readOnly) {
      const retentionLabel =
        retentionOptions.find(opt => opt.value === defaultRetention)?.label || defaultRetention;
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input value={data.name} disabled />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Input value={data.domain || '—'} disabled />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input value={data.timezone} disabled />
            </div>
            <div className="space-y-2">
              <Label>Data Retention</Label>
              <Input value={retentionLabel} disabled />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            You have read-only access to this project. Contact a project owner or editor to change these settings.
          </p>
        </div>
      );
    }

    return (
      <form action={handleSubmit}>
        <input type="hidden" name="projectId" value={projectId} />
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                name="name"
                defaultValue={data.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain">Domain (optional)</Label>
              <Input
                id="domain"
                name="domain"
                defaultValue={data.domain}
                placeholder="example.com"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select name="timezone" defaultValue={data.timezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retention">Data Retention</Label>
              <Select name="retentionDays" defaultValue={defaultRetention}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {retentionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {userPlan === 'free' && (
                <p className="text-xs text-muted-foreground">
                  Upgrade your plan for longer data retention
                </p>
              )}
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="active:scale-[0.98] transition-transform"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Project Settings
            </Button>
          </div>
        </div>
      </form>
    );
  }

  if (type === 'delete') {
    return (
      <DeleteProjectForm
        projectId={projectId || ''}
        projectName={projectName || ''}
      />
    );
  }

  return null;
}

interface DeleteProjectFormProps {
  projectId: string;
  projectName: string;
}

/**
 * Vercel-style destructive delete confirmation. The Delete button stays
 * disabled until the user types the project name exactly, mirroring the
 * pattern they're used to from their hosting/billing/repos elsewhere.
 *
 * On success we navigate manually instead of letting the server action
 * redirect() because Next.js implements that as a thrown error - any client
 * try/catch around the action call would misread it as a failure.
 */
function DeleteProjectForm({ projectId, projectName }: DeleteProjectFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [isPending, startTransition] = useTransition();

  const typedMatches = typed.trim() === projectName;

  const handleDelete = () => {
    if (!typedMatches) return;
    const formData = new FormData();
    formData.set('projectId', projectId);

    startTransition(async () => {
      const result = await deleteProject(formData);
      if (result?.success) {
        toast.success(`${projectName} deleted`);
        setOpen(false);
        // Navigate after revalidate has run so the dashboard fetches the
        // user's remaining projects (or routes through the "create a project"
        // empty state if this was their last one).
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.error(result?.error || 'Failed to delete project');
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="font-medium">Delete this project</p>
        <p className="text-sm text-muted-foreground">
          Permanently deletes all events, sessions, funnels, alerts, webhooks, and recordings for this project.
        </p>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setTyped('');
          setOpen(next);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="destructive">Delete Project</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {projectName}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the project and every event, session, alert, webhook, and recording attached to it. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              All historical analytics for <strong>{projectName}</strong> will be gone. Any apps using its API key will start getting 401s immediately.
            </AlertDescription>
          </Alert>

          <div className="space-y-2 mt-2">
            <Label htmlFor="confirm-project-name">
              Type <span className="font-mono text-foreground">{projectName}</span> to confirm
            </Label>
            <Input
              id="confirm-project-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={projectName}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!typedMatches || isPending}
              onClick={handleDelete}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>I understand, delete {projectName}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
