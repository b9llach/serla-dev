'use client';

import { useMemo } from 'react';

interface RetentionHeatmapProps {
  cohorts: { week: string; data: number[] }[];
}

export function RetentionHeatmap({ cohorts }: RetentionHeatmapProps) {
  const { maxWeeks, flattenedData, overallRetention } = useMemo(() => {
    if (!cohorts || cohorts.length === 0) {
      return { maxWeeks: 0, flattenedData: [], overallRetention: 0 };
    }

    const lengths = cohorts.map(c => c.data?.length || 0);
    const max = lengths.length > 0 ? Math.max(...lengths) : 0;

    if (max === 0) {
      return { maxWeeks: 0, flattenedData: [], overallRetention: 0 };
    }

    // Flatten all values into a single array for the grid
    const flattened: { value: number; hasValue: boolean }[] = [];
    let totalRetention = 0;
    let validCount = 0;

    cohorts.forEach((cohort) => {
      for (let i = 0; i < max; i++) {
        const value = cohort.data?.[i];
        const hasValue = value !== undefined && value >= 0;
        flattened.push({ value: hasValue ? value : 0, hasValue });

        if (hasValue && i > 0) {
          totalRetention += value;
          validCount++;
        }
      }
    });

    return {
      maxWeeks: max,
      flattenedData: flattened,
      overallRetention: validCount > 0 ? Math.round(totalRetention / validCount) : 0,
    };
  }, [cohorts]);

  if (maxWeeks === 0 || flattenedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="text-zinc-400 font-medium mb-1">No retention data yet</p>
        <p className="text-zinc-600 text-sm max-w-xs">
          Track events with user IDs to see how users return over time
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-8">
        <div>
          <p className="text-xs sm:text-sm text-zinc-500 mb-1">Cohorts</p>
          <p className="text-xl sm:text-2xl font-semibold text-white">{cohorts.length}</p>
        </div>
        <div>
          <p className="text-xs sm:text-sm text-zinc-500 mb-1">Weeks tracked</p>
          <p className="text-xl sm:text-2xl font-semibold text-white">{maxWeeks}</p>
        </div>
        <div>
          <p className="text-xs sm:text-sm text-zinc-500 mb-1">Avg retention</p>
          <p className="text-xl sm:text-2xl font-semibold text-purple-400">{overallRetention}%</p>
        </div>
      </div>

      {/* Heatmap grid - horizontally scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${maxWeeks}, minmax(48px, 1fr))`,
            minWidth: maxWeeks > 6 ? `${maxWeeks * 52}px` : 'auto'
          }}
        >
          {flattenedData.map((cell, i) => {
            const intensity = cell.hasValue ? cell.value / 100 : 0;
            return (
              <div
                key={i}
                className="h-12 sm:h-16 md:h-20 rounded flex items-center justify-center cursor-default"
                style={{
                  backgroundColor: cell.hasValue
                    ? `rgba(139, 92, 246, ${intensity * 0.8})`
                    : 'rgba(39, 39, 42, 0.3)',
                }}
              >  
                {cell.hasValue && (
                  <span className={`text-xs sm:text-sm md:text-base font-medium ${intensity > 0.4 ? 'text-white' : 'text-purple-200'}`}>
                    {cell.value}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer labels */}
      <div className="flex justify-between text-xs text-zinc-600">
        <span>Week 0</span>
        <span>Week {maxWeeks - 1}</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-6 pt-4 border-t border-zinc-800/30">
        <span className="text-xs text-zinc-500">Retention</span>
        <div className="flex items-center gap-1">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((opacity, i) => (
            <div
              key={i}
              className="w-5 h-5 sm:w-6 sm:h-6 rounded"
              style={{ backgroundColor: `rgba(139, 92, 246, ${opacity * 0.8})` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-4 text-[10px] sm:text-xs text-zinc-600">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
