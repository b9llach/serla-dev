'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { X } from 'lucide-react';
import { format, parse } from 'date-fns';

interface EventFiltersProps {
  eventNames: string[];
  currentName?: string;
  startDate?: string;
  endDate?: string;
}

export function EventFilters({
  eventNames,
  currentName,
  startDate,
  endDate,
}: EventFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('cursor'); // Reset pagination when filters change
    router.push(`/dashboard/events?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push('/dashboard/events');
  };

  const hasFilters = currentName || startDate || endDate;

  const parseDate = (dateStr?: string): Date | undefined => {
    if (!dateStr) return undefined;
    try {
      return parse(dateStr, 'yyyy-MM-dd', new Date());
    } catch {
      return undefined;
    }
  };

  const formatDate = (date: Date | undefined): string | null => {
    if (!date) return null;
    return format(date, 'yyyy-MM-dd');
  };

  return (
    <div className="flex flex-wrap gap-3 sm:gap-4 items-end">
      <div className="w-full sm:w-auto sm:flex-1 sm:min-w-[200px]">
        <Select
          value={currentName || '__all__'}
          onValueChange={(value) => updateFilter('name', value === '__all__' ? null : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All event types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All event types</SelectItem>
            {eventNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
        <DatePicker
          value={parseDate(startDate)}
          onChange={(date) => updateFilter('startDate', formatDate(date))}
          placeholder="Start date"
          className="flex-1 sm:flex-none"
        />
        <DatePicker
          value={parseDate(endDate)}
          onChange={(date) => updateFilter('endDate', formatDate(date))}
          placeholder="End date"
          className="flex-1 sm:flex-none"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full sm:w-auto">
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
