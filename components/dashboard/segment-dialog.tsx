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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { createSegment } from '@/lib/actions/segments';
import { toast } from 'sonner';

interface SegmentDialogProps {
  projectId: string;
  children: ReactNode;
}

interface Condition {
  field: string;
  operator: string;
  value: string;
}

const FIELDS = [
  { value: 'country', label: 'Country' },
  { value: 'browser', label: 'Browser' },
  { value: 'os', label: 'Operating System' },
  { value: 'deviceType', label: 'Device Type' },
  { value: 'utmSource', label: 'UTM Source' },
  { value: 'utmMedium', label: 'UTM Medium' },
  { value: 'utmCampaign', label: 'UTM Campaign' },
  { value: 'referrerDomain', label: 'Referrer Domain' },
];

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
];

export function SegmentDialog({ projectId, children }: SegmentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [logic, setLogic] = useState<'and' | 'or'>('and');
  const [conditions, setConditions] = useState<Condition[]>([
    { field: 'country', operator: 'equals', value: '' },
  ]);

  const addCondition = () => {
    setConditions([...conditions, { field: 'country', operator: 'equals', value: '' }]);
  };

  const removeCondition = (index: number) => {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: keyof Condition, value: string) => {
    const newConditions = [...conditions];
    newConditions[index][field] = value;
    setConditions(newConditions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData();
    formData.set('projectId', projectId);
    formData.set('name', name);
    formData.set('filters', JSON.stringify({ logic, conditions }));

    await createSegment(formData);
    setLoading(false);
    setOpen(false);
    toast.success('Segment created successfully');
    setName('');
    setConditions([{ field: 'country', operator: 'equals', value: '' }]);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Segment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Segment Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Mobile Users from US"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Match Logic</Label>
              <Select value={logic} onValueChange={(v) => setLogic(v as 'and' | 'or')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="and">Match ALL conditions (AND)</SelectItem>
                  <SelectItem value="or">Match ANY condition (OR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Conditions</Label>
              <div className="space-y-3">
                {conditions.map((condition, index) => (
                  <div key={index} className="flex gap-2">
                    <Select
                      value={condition.field}
                      onValueChange={(v) => updateCondition(index, 'field', v)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELDS.map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={condition.operator}
                      onValueChange={(v) => updateCondition(index, 'operator', v)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      value={condition.value}
                      onChange={(e) => updateCondition(index, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1"
                      required
                    />

                    {conditions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCondition(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                <Plus className="h-4 w-4 mr-1" />
                Add Condition
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Segment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
