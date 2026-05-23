'use client';

import { useMemo, useId } from 'react';

interface FunnelStep {
  name: string;
  type: string;
  eventName?: string;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  counts: number[];
}

export function FunnelChart({ steps, counts }: FunnelChartProps) {
  const uniqueId = useId().replace(/:/g, '');
  const gradientId = `funnel-gradient-${uniqueId}`;

  const funnelData = useMemo(() => {
    const maxCount = Math.max(...counts, 1);

    return steps.map((step, index) => {
      const count = counts[index] || 0;
      const prevCount = index > 0 ? counts[index - 1] : count;
      const nextCount = index < counts.length - 1 ? counts[index + 1] : count;
      const conversionRate = prevCount > 0 ? (count / prevCount * 100) : 100;
      const dropoff = 100 - conversionRate;
      const widthPercent = Math.max((count / maxCount) * 100, 15);
      const nextWidthPercent = Math.max((nextCount / maxCount) * 100, 15);

      return {
        ...step,
        count,
        conversionRate,
        dropoff,
        widthPercent,
        nextWidthPercent,
        isFirst: index === 0,
        isLast: index === steps.length - 1,
      };
    });
  }, [steps, counts]);

  if (steps.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        No funnel steps defined
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
      </svg>

      {funnelData.map((step, index) => (
        <div key={index} className="relative">
          {/* Step content - stacked on mobile, horizontal on desktop */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            {/* Top/Left side: Step info */}
            <div className="sm:w-48 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-sm font-semibold text-blue-400">{index + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{step.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{step.eventName}</p>
                </div>
                {/* Mobile-only: Show metrics inline */}
                <div className="sm:hidden text-right">
                  {!step.isFirst ? (
                    <div>
                      <span className="text-sm font-medium text-white">
                        {step.conversionRate.toFixed(1)}%
                      </span>
                      <span className="text-xs text-red-400 ml-2">
                        -{step.dropoff.toFixed(1)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500">Start</span>
                  )}
                </div>
              </div>
            </div>

            {/* Center: Funnel visualization */}
            <div className="flex-1 relative h-12 sm:h-16">
              <svg
                viewBox="0 0 400 60"
                className="w-full h-full"
                preserveAspectRatio="none"
              >
                {/* Funnel segment */}
                <path
                  d={generateFunnelPath(step.widthPercent, step.nextWidthPercent, step.isLast)}
                  fill={`url(#${gradientId})`}
                  className="transition-all duration-500"
                />

                {/* Highlight edge */}
                <path
                  d={generateFunnelTopEdge(step.widthPercent)}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={1}
                />
              </svg>

              {/* Count label inside funnel */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-base sm:text-lg font-bold text-white drop-shadow-lg">
                  {step.count.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Right side: Metrics - hidden on mobile (shown inline above) */}
            <div className="hidden sm:block w-32 shrink-0 text-right">
              {!step.isFirst && (
                <div className="space-y-1">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-sm font-medium text-white">
                      {step.conversionRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <svg className="w-3 h-3 text-red-400" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M6 9L2 5h8L6 9z" />
                    </svg>
                    <span className="text-xs text-red-400">
                      -{step.dropoff.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
              {step.isFirst && (
                <span className="text-xs text-zinc-500">Starting point</span>
              )}
            </div>
          </div>

          {/* Connector line between steps */}
          {!step.isLast && (
            <div className="ml-4 sm:ml-52 h-2 flex items-center">
              <div className="flex-1 flex justify-center">
                <div className="w-0.5 h-full bg-gradient-to-b from-blue-500/50 to-blue-500/20" />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Summary stats */}
      <div className="mt-8 pt-6 border-t border-zinc-800/50">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">
              {funnelData[0]?.count.toLocaleString() || 0}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Entered</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white">
              {funnelData[funnelData.length - 1]?.count.toLocaleString() || 0}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Completed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">
              {funnelData[0]?.count > 0
                ? ((funnelData[funnelData.length - 1]?.count / funnelData[0]?.count) * 100).toFixed(1)
                : 0}%
            </p>
            <p className="text-xs text-zinc-500 mt-1">Overall Conversion</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function generateFunnelPath(widthPercent: number, nextWidthPercent: number, isLast: boolean): string {
  const viewWidth = 400;
  const viewHeight = 60;
  const padding = 20;

  const topWidth = (widthPercent / 100) * (viewWidth - padding * 2);
  const bottomWidth = isLast ? topWidth : (nextWidthPercent / 100) * (viewWidth - padding * 2);

  const centerX = viewWidth / 2;

  const topLeft = centerX - topWidth / 2;
  const topRight = centerX + topWidth / 2;
  const bottomLeft = centerX - bottomWidth / 2;
  const bottomRight = centerX + bottomWidth / 2;

  // Create trapezoid with slightly rounded corners
  return `
    M ${topLeft + 4} 4
    Q ${topLeft} 4 ${topLeft} 8
    L ${bottomLeft} ${viewHeight - 8}
    Q ${bottomLeft} ${viewHeight - 4} ${bottomLeft + 4} ${viewHeight - 4}
    L ${bottomRight - 4} ${viewHeight - 4}
    Q ${bottomRight} ${viewHeight - 4} ${bottomRight} ${viewHeight - 8}
    L ${topRight} 8
    Q ${topRight} 4 ${topRight - 4} 4
    Z
  `;
}

function generateFunnelTopEdge(widthPercent: number): string {
  const viewWidth = 400;
  const padding = 20;

  const topWidth = (widthPercent / 100) * (viewWidth - padding * 2);
  const centerX = viewWidth / 2;

  const topLeft = centerX - topWidth / 2;
  const topRight = centerX + topWidth / 2;

  return `M ${topLeft + 4} 4 L ${topRight - 4} 4`;
}
