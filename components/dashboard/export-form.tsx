'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ExportFormProps {
  projectId: string;
  eventNames: string[];
}

export function ExportForm({ projectId, eventNames }: ExportFormProps) {
  const [loading, setLoading] = useState(false);
  const [formatType, setFormatType] = useState('csv');
  const [eventName, setEventName] = useState('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [limit, setLimit] = useState('1000');

  const handleExport = async () => {
    setLoading(true);

    const params = new URLSearchParams({
      format: formatType,
      limit,
    });

    if (eventName && eventName !== 'all') {
      params.set('eventName', eventName);
    }
    if (startDate) {
      params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params.set('endDate', endDate.toISOString());
    }

    try {
      const response = await fetch(`/api/internal/export?${params.toString()}&projectId=${projectId}`);

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `events-${new Date().toISOString().split('T')[0]}.${formatType}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">Format</label>
          <Select value={formatType} onValueChange={setFormatType}>
            <SelectTrigger className="bg-[#0a0a0a] border-0 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">Event Type</label>
          <Select value={eventName} onValueChange={setEventName}>
            <SelectTrigger className="bg-[#0a0a0a] border-0 h-10">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {eventNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">Start Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal h-10 bg-[#0a0a0a] border-0 hover:bg-[#141414]',
                  !startDate && 'text-zinc-500'
                )}
              >
                <CalendarIcon className="mr-2.5 h-4 w-4 text-zinc-500" />
                {startDate ? format(startDate, 'MMM d, yyyy') : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-[#1a1a1a] border-zinc-800" align="start" sideOffset={8}>
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">End Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal h-10 bg-[#0a0a0a] border-0 hover:bg-[#141414]',
                  !endDate && 'text-zinc-500'
                )}
              >
                <CalendarIcon className="mr-2.5 h-4 w-4 text-zinc-500" />
                {endDate ? format(endDate, 'MMM d, yyyy') : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-[#1a1a1a] border-zinc-800" align="start" sideOffset={8}>
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-400">Max Records</label>
        <Select value={limit} onValueChange={setLimit}>
          <SelectTrigger className="bg-[#0a0a0a] border-0 h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="500">500</SelectItem>
            <SelectItem value="1000">1,000</SelectItem>
            <SelectItem value="5000">5,000</SelectItem>
            <SelectItem value="10000">10,000</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={handleExport}
        disabled={loading}
        className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium"
      >
        <Download className="h-4 w-4 mr-2" />
        {loading ? 'Exporting...' : 'Export Data'}
      </Button>
    </div>
  );
}
