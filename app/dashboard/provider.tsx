'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { Project } from '@/lib/db/schema';
import { RealtimeProvider } from '@/lib/contexts/realtime-context';

interface DashboardContextType {
  projects: Project[];
  currentProjectId: string | null;
  setCurrentProjectId: (id: string) => void;
  currentProject: Project | null;
  realtimeToastsEnabled: boolean;
  setRealtimeToastsEnabled: (enabled: boolean) => void;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}

interface DashboardProviderProps {
  children: ReactNode;
  initialProjects: Project[];
  initialProjectId?: string;
}

export function DashboardProvider({
  children,
  initialProjects,
  initialProjectId,
}: DashboardProviderProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    initialProjectId || null
  );

  // Sync state when the server re-renders with new props (project switch or
  // creation). Adjusted during render with previous-value guards - React's
  // documented pattern. Doing this in an effect costs an extra render pass
  // and briefly paints stale data.
  const [prevProjectId, setPrevProjectId] = useState(initialProjectId);
  const [prevProjectsLen, setPrevProjectsLen] = useState(initialProjects.length);
  if (
    initialProjectId !== prevProjectId ||
    initialProjects.length !== prevProjectsLen
  ) {
    setPrevProjectId(initialProjectId);
    setPrevProjectsLen(initialProjects.length);
    setCurrentProjectId(initialProjectId || null);
    setProjects(initialProjects);
  }
  const [realtimeToastsEnabled, setRealtimeToastsEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('serla:realtime-toasts');
      return stored === 'true';
    }
    return false;
  });

  // Save toast preference to localStorage and broadcast to global component
  const handleSetRealtimeToasts = (enabled: boolean) => {
    setRealtimeToastsEnabled(enabled);
    localStorage.setItem('serla:realtime-toasts', String(enabled));
    // Dispatch custom event for global realtime component
    window.dispatchEvent(new CustomEvent('serla:realtime-toggle', { detail: enabled }));
  };

  const currentProject = projects.find(p => p.id === currentProjectId) || null;

  return (
    <DashboardContext.Provider
      value={{
        projects,
        currentProjectId,
        setCurrentProjectId,
        currentProject,
        realtimeToastsEnabled,
        setRealtimeToastsEnabled: handleSetRealtimeToasts,
      }}
    >
      <RealtimeProvider>
        {children}
      </RealtimeProvider>
    </DashboardContext.Provider>
  );
}
