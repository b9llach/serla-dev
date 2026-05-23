'use client';

import { useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createMetric } from '@/lib/actions/metrics';
import { toast } from 'sonner';

interface MetricDialogProps {
  projectId: string;
  children: ReactNode;
}

const AGGREGATIONS = [
  { value: 'count', label: 'Count', description: 'Count of events' },
  { value: 'unique', label: 'Unique', description: 'Count of unique users' },
  { value: 'sum', label: 'Sum', description: 'Sum of property values' },
  { value: 'avg', label: 'Average', description: 'Average of property values' },
  { value: 'min', label: 'Minimum', description: 'Minimum property value' },
  { value: 'max', label: 'Maximum', description: 'Maximum property value' },
];

export function MetricDialog({ projectId, children }: MetricDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aggregation, setAggregation] = useState('count');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set('projectId', projectId);
    formData.set('aggregation', aggregation);

    await createMetric(formData);
    setLoading(false);
    setOpen(false);
    toast.success('Metric created successfully');
    router.refresh();
  };

  const needsProperty = ['sum', 'avg', 'min', 'max'].includes(aggregation);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Custom Metric</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Metric Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Total Revenue"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="What does this metric measure?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Aggregation</Label>
              <Select value={aggregation} onValueChange={setAggregation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGGREGATIONS.map((agg) => (
                    <SelectItem key={agg.value} value={agg.value}>
                      <div>
                        <span className="font-medium">{agg.label}</span>
                        <span className="text-muted-foreground ml-2">- {agg.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventName">Event Name</Label>
              <Input
                id="eventName"
                name="eventName"
                placeholder="e.g., purchase"
                required
              />
            </div>

            {needsProperty && (
              <div className="space-y-2">
                <Label htmlFor="property">Property to Aggregate</Label>
                <Input
                  id="property"
                  name="property"
                  placeholder="e.g., amount"
                  required={needsProperty}
                />
                <p className="text-xs text-muted-foreground">
                  The numeric property in the event to aggregate
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Metric'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
