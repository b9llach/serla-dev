'use client';

import { useMemo, type ReactElement } from 'react';

interface AttributionChartProps {
  data: { name: string; count: number }[];
}

const CHANNEL_COLORS: Record<string, string> = {
  'direct': '#3b82f6',
  'organic': '#22c55e',
  'google': '#f97316',
  'facebook': '#8b5cf6',
  'twitter': '#06b6d4',
  'linkedin': '#0ea5e9',
  'email': '#ec4899',
  'referral': '#14b8a6',
  'paid': '#eab308',
  'default': '#6b7280',
};

function getChannelColor(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, color] of Object.entries(CHANNEL_COLORS)) {
    if (lowerName.includes(key)) return color;
  }
  return CHANNEL_COLORS.default;
}

export function AttributionChart({ data }: AttributionChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const total = data.reduce((sum, item) => sum + item.count, 0);
    const maxCount = Math.max(...data.map(d => d.count));

    return data
      .sort((a, b) => b.count - a.count)
      .map((item, index) => ({
        ...item,
        percentage: (item.count / total) * 100,
        widthPercent: (item.count / maxCount) * 100,
        color: getChannelColor(item.name),
        rank: index + 1,
      }));
  }, [data]);

  if (!chartData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <p className="text-zinc-400 font-medium mb-1">No attribution data yet</p>
        <p className="text-zinc-600 text-sm max-w-xs">
          Track UTM parameters and referrers to see traffic sources
        </p>
      </div>
    );
  }

  const total = chartData.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6">
      {/* Horizontal bar chart */}
      <div className="space-y-3">
        {chartData.map((item) => (
          <div key={item.name} className="group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-white truncate group-hover:text-blue-400 transition-colors">
                  {item.name || 'Unknown'}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-medium text-white">
                  {item.count.toLocaleString()}
                </span>
                <span className="text-xs text-zinc-500 w-12 text-right">
                  {item.percentage.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Bar */}
            <div className="h-8 bg-zinc-900/50 rounded-lg overflow-hidden relative">
              <div
                className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500 group-hover:brightness-110"
                style={{
                  width: `${item.widthPercent}%`,
                  backgroundColor: item.color,
                  opacity: 0.8,
                }}
              />
              {/* Gradient overlay for depth */}
              <div
                className="absolute inset-y-0 left-0 rounded-lg"
                style={{
                  width: `${item.widthPercent}%`,
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
                }}
              />
              {/* Percentage inside bar */}
              {item.widthPercent > 20 && (
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-xs font-medium text-white/80">
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary section */}
      <div className="pt-4 border-t border-zinc-800/30">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] text-zinc-500 mb-1">Total Visits</p>
            <p className="text-xl font-semibold text-white">{total.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500 mb-1">Top Channel</p>
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: chartData[0]?.color }}
              />
              <p className="text-xl font-semibold text-white truncate">
                {chartData[0]?.name || '-'}
              </p>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500 mb-1">Channels</p>
            <p className="text-xl font-semibold text-white">{chartData.length}</p>
          </div>
        </div>
      </div>

      {/* Mini pie visualization */}
      <div className="flex items-center justify-center gap-6 pt-2">
        <svg viewBox="0 0 100 100" className="w-24 h-24">
          {chartData.reduce((acc, item, index) => {
            const startAngle = acc.currentAngle;
            const angle = (item.percentage / 100) * 360;
            const endAngle = startAngle + angle;

            const startRad = (startAngle - 90) * (Math.PI / 180);
            const endRad = (endAngle - 90) * (Math.PI / 180);

            const x1 = 50 + 40 * Math.cos(startRad);
            const y1 = 50 + 40 * Math.sin(startRad);
            const x2 = 50 + 40 * Math.cos(endRad);
            const y2 = 50 + 40 * Math.sin(endRad);

            const largeArc = angle > 180 ? 1 : 0;

            const path = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;

            acc.elements.push(
              <path
                key={index}
                d={path}
                fill={item.color}
                opacity={0.8}
                className="transition-opacity hover:opacity-100"
              />
            );

            acc.currentAngle = endAngle;
            return acc;
          }, { elements: [] as ReactElement[], currentAngle: 0 }).elements}
          {/* Center circle for donut effect */}
          <circle cx="50" cy="50" r="25" fill="#141414" />
        </svg>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {chartData.slice(0, 6).map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[11px] text-zinc-400 truncate max-w-[80px]">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
