'use client';

import { useState } from 'react';
import { Project } from '@/lib/db/schema';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Bell } from 'lucide-react';

interface HeaderProps {
  projects: Project[];
  currentProjectId: string;
  onProjectChange?: (projectId: string) => void;
}

export function Header({ projects, currentProjectId, onProjectChange }: HeaderProps) {
  const currentProject = projects.find(p => p.id === currentProjectId);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-4">
        {projects.length > 0 && (
          <Select
            value={currentProjectId}
            onValueChange={onProjectChange}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
