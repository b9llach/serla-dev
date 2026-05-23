'use client';

import { useMemo } from 'react';

interface JourneyPathsProps {
  paths: { path: string; count: number }[];
}

export function JourneyPaths({ paths }: JourneyPathsProps) {
  const journeyData = useMemo(() => {
    if (!paths || paths.length === 0) return null;

    const maxCount = Math.max(...paths.map(p => p.count));
    const total = paths.reduce((sum, p) => sum + p.count, 0);

    return paths.map((item, index) => {
      const steps = item.path.split(' -> ');
      const widthPercent = (item.count / maxCount) * 100;
      const percentage = (item.count / total) * 100;

      return {
        ...item,
        steps,
        widthPercent,
        percentage,
        rank: index + 1,
      };
    });
  }, [paths]);

  if (!journeyData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </div>
        <p className="text-zinc-400 font-medium mb-1">No journey data yet</p>
        <p className="text-zinc-600 text-sm max-w-xs">
          Track pageviews with user IDs to see how users navigate your site
        </p>
      </div>
    );
  }

  const total = journeyData.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="space-y-6">
      {/* Path list */}
      <div className="space-y-4">
        {journeyData.map((journey, index) => (
          <div
            key={index}
            className="group bg-zinc-900/30 rounded-xl p-4 hover:bg-zinc-900/50 transition-colors"
          >
            {/* Header with rank and count */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-medium text-blue-400">
                  {journey.rank}
                </span>
                <span className="text-xs text-zinc-500">
                  {journey.percentage.toFixed(1)}% of journeys
                </span>
              </div>
              <span className="text-sm font-semibold text-white">
                {journey.count.toLocaleString()} sessions
              </span>
            </div>

            {/* Flow diagram */}
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {journey.steps.map((step, stepIndex) => (
                <div key={stepIndex} className="flex items-center shrink-0">
                  {/* Step node */}
                  <div className="relative group/step">
                    <div
                      className={`
                        px-3 py-2 rounded-lg text-xs font-mono
                        ${stepIndex === 0
                          ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/30'
                          : stepIndex === journey.steps.length - 1
                            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                            : 'bg-zinc-800 text-zinc-300'}
                        transition-all group-hover/step:scale-105
                      `}
                    >
                      <span className="truncate max-w-[120px] block">
                        {step === '/' ? 'Home' : step.replace(/^\//, '')}
                      </span>
                    </div>

                    {/* Step indicator */}
                    {stepIndex === 0 && (
                      <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-green-500" />
                    )}
                    {stepIndex === journey.steps.length - 1 && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>

                  {/* Connector arrow */}
                  {stepIndex < journey.steps.length - 1 && (
                    <div className="flex items-center mx-1">
                      <div className="w-4 h-px bg-gradient-to-r from-zinc-600 to-zinc-700" />
                      <svg className="w-3 h-3 text-zinc-600 -ml-0.5" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M4.5 2l4 4-4 4V2z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${journey.widthPercent}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="pt-4 border-t border-zinc-800/30">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] text-zinc-500 mb-1">Total Sessions</p>
            <p className="text-lg font-semibold text-white">{total.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500 mb-1">Unique Paths</p>
            <p className="text-lg font-semibold text-white">{journeyData.length}</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500 mb-1">Avg Steps</p>
            <p className="text-lg font-semibold text-white">
              {(journeyData.reduce((sum, j) => sum + j.steps.length, 0) / journeyData.length).toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500 mb-1">Top Path Share</p>
            <p className="text-lg font-semibold text-white">
              {journeyData[0]?.percentage.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>Entry point</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span>Exit point</span>
        </div>
      </div>
    </div>
  );
}
