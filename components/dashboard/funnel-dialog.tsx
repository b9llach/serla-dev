'use client';

import { useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { createFunnel } from '@/lib/actions/funnels';
import { toast } from 'sonner';

interface FunnelDialogProps {
  projectId: string;
  children: ReactNode;
}

interface Step {
  name: string;
  eventName: string;
}

export function FunnelDialog({ projectId, children }: FunnelDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [windowDays, setWindowDays] = useState('7');
  const [steps, setSteps] = useState<Step[]>([
    { name: 'Step 1', eventName: '' },
    { name: 'Step 2', eventName: '' },
  ]);

  const addStep = () => {
    setSteps([...steps, { name: `Step ${steps.length + 1}`, eventName: '' }]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 2) return;
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: keyof Step, value: string) => {
    const newSteps = [...steps];
    newSteps[index][field] = value;
    setSteps(newSteps);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData();
    formData.set('projectId', projectId);
    formData.set('name', name);
    formData.set('windowDays', windowDays);
    formData.set('steps', JSON.stringify(steps.map(s => ({
      name: s.name,
      type: 'event',
      eventName: s.eventName,
    }))));

    await createFunnel(formData);
    setLoading(false);
    setOpen(false);
    toast.success('Funnel created successfully');
    setName('');
    setSteps([
      { name: 'Step 1', eventName: '' },
      { name: 'Step 2', eventName: '' },
    ]);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Funnel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Funnel Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Signup Flow"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="windowDays">Conversion Window (days)</Label>
              <Input
                id="windowDays"
                type="number"
                min="1"
                max="30"
                value={windowDays}
                onChange={(e) => setWindowDays(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Funnel Steps</Label>
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={step.name}
                      onChange={(e) => updateStep(index, 'name', e.target.value)}
                      placeholder="Step name"
                      className="w-32"
                    />
                    <Input
                      value={step.eventName}
                      onChange={(e) => updateStep(index, 'eventName', e.target.value)}
                      placeholder="Event name"
                      className="flex-1"
                      required
                    />
                    {steps.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStep(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-4 w-4 mr-1" />
                Add Step
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Funnel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
