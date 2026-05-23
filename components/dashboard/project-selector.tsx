'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/app/dashboard/provider';
import { ChevronDown, Plus, Check, FolderKanban } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createProject, switchProject } from '@/lib/actions/projects';
import { toast } from 'sonner';
import { Serla } from 'serla-js';

export function ProjectSelector() {
  const { projects, currentProject, setCurrentProjectId } = useDashboard();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const handleSwitchProject = async (projectId: string) => {
    setCurrentProjectId(projectId);
    await switchProject(projectId);
    router.refresh();
  };

  const handleCreateProject = async (formData: FormData) => {
    setIsCreating(true);
    try {
      const result = await createProject(formData);
      if (result?.success && result.projectId) {
        Serla.track('project_created', { projectId: result.projectId });
        setCurrentProjectId(result.projectId);
        setIsCreateOpen(false);
        // Send the user straight to the API keys page so they can mint a
        // key for the new project - that's the first thing they need.
        router.push('/dashboard/settings/api-keys');
        router.refresh();
      } else if (result?.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error('Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center justify-between w-full rounded-lg px-3 py-2 text-[13px] bg-[#141414] border border-zinc-800 hover:border-zinc-700 transition-colors">
            <span className="flex items-center gap-2 truncate">
              <FolderKanban className="h-4 w-4 text-zinc-500 flex-shrink-0" strokeWidth={1.5} />
              <span className="truncate text-zinc-200">
                {currentProject?.name || 'Select project'}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-zinc-500 flex-shrink-0" strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[200px] bg-[#1a1a1a] border-zinc-800"
        >
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => handleSwitchProject(project.id)}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="truncate">{project.name}</span>
              {currentProject?.id === project.id && (
                <Check className="h-4 w-4 text-green-500" strokeWidth={2} />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 cursor-pointer text-zinc-400"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Create new project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-[#141414] border-zinc-800">
          <DialogHeader>
            <DialogTitle>Create new project</DialogTitle>
            <DialogDescription>
              Add a new project to track analytics separately. After creating, you&apos;ll be taken to the API keys page to mint a key for it.
            </DialogDescription>
          </DialogHeader>
          <form action={handleCreateProject}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="My Website"
                  required
                  autoFocus
                  className="bg-[#0a0a0a] border-zinc-800"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Domain (optional)</Label>
                <Input
                  id="domain"
                  name="domain"
                  placeholder="example.com"
                  className="bg-[#0a0a0a] border-zinc-800"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
