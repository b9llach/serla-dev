'use client';

import { useMemo, useState, useId } from 'react';

interface EventsChartProps {
  data: { date: string; count: number }[];
}

export function EventsChart({ data }: EventsChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const uniqueId = useId().replace(/:/g, '');
  const gradientId = `events-gradient-${uniqueId}`;
  const glowId = `events-glow-${uniqueId}`;

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const counts = data.map(d => Number(d.count));
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const range = max - min || 1;

    const width = 100;
    const height = 50;
    const padding = { top: 4, right: 4, bottom: 4, left: 4 };
    const effectiveWidth = width - padding.left - padding.right;
    const effectiveHeight = height - padding.top - padding.bottom;

    const points = data.map((item, i) => ({
      x: padding.left + (i / (data.length - 1)) * effectiveWidth,
      y: padding.top + effectiveHeight - ((Number(item.count) - min) / range) * effectiveHeight,
      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: Number(item.count),
      index: i,
    }));

    // Generate smooth bezier curve
    let pathD = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const tension = 0.25;
      const cp1x = prev.x + (curr.x - prev.x) * tension;
      const cp1y = prev.y;
      const cp2x = curr.x - (curr.x - prev.x) * tension;
      const cp2y = curr.y;
      pathD += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${curr.x},${curr.y}`;
    }

    // Area path
    const areaD = `${pathD} L ${points[points.length - 1].x},${height - padding.bottom} L ${points[0].x},${height - padding.bottom} Z`;

    return { points, pathD, areaD, max, min, width, height };
  }, [data]);

  if (!chartData) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
        </div>
        <p className="text-zinc-400 font-medium mb-1">No data available</p>
        <p className="text-zinc-600 text-sm">Events will appear here once tracked</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="relative h-[280px]">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between text-right pr-3">
          <span className="text-[11px] text-zinc-500">{chartData.max.toLocaleString()}</span>
          <span className="text-[11px] text-zinc-500">{Math.round((chartData.max + chartData.min) / 2).toLocaleString()}</span>
          <span className="text-[11px] text-zinc-500">{chartData.min.toLocaleString()}</span>
        </div>

        {/* Chart area */}
        <div className="ml-12 h-full relative">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2].map(i => (
              <div key={i} className="border-t border-zinc-800/50 w-full" />
            ))}
          </div>

          {/* SVG Chart */}
          <svg
            viewBox={`0 0 ${chartData.width} ${chartData.height}`}
            className="w-full h-[calc(100%-32px)]"
            preserveAspectRatio="none"
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Area fill */}
            <path d={chartData.areaD} fill={`url(#${gradientId})`} />

            {/* Main line */}
            <path
              d={chartData.pathD}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${glowId})`}
            />

            {/* Interactive points */}
            {chartData.points.map((point, i) => (
              <g key={i}>
                {/* Invisible hover area */}
                <rect
                  x={point.x - chartData.width / chartData.points.length / 2}
                  y={0}
                  width={chartData.width / chartData.points.length}
                  height={chartData.height}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(i)}
                />

                {/* Visible dot on hover */}
                {hoveredIndex === i && (
                  <>
                    <line
                      x1={point.x}
                      y1={0}
                      x2={point.x}
                      y2={chartData.height}
                      stroke="#3b82f6"
                      strokeWidth={0.5}
                      strokeDasharray="2,2"
                      opacity={0.5}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={4}
                      fill="#3b82f6"
                      stroke="#0a0a0a"
                      strokeWidth={2}
                    />
                  </>
                )}
              </g>
            ))}
          </svg>

          {/* X-axis labels */}
          <div className="h-8 flex justify-between items-center px-1">
            {chartData.points.filter((_, i) => i % Math.ceil(chartData.points.length / 7) === 0 || i === chartData.points.length - 1).map((point) => (
              <span key={point.index} className="text-[11px] text-zinc-500">
                {point.date}
              </span>
            ))}
          </div>

          {/* Tooltip */}
          {hoveredIndex !== null && (
            <div
              className="absolute top-2 bg-zinc-900 rounded-lg px-3 py-2 shadow-xl pointer-events-none z-10 border border-zinc-800"
              style={{
                left: `${(chartData.points[hoveredIndex].x / chartData.width) * 100}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <p className="text-xs text-zinc-400">{chartData.points[hoveredIndex].date}</p>
              <p className="text-sm font-semibold text-white">
                {chartData.points[hoveredIndex].count.toLocaleString()} events
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 pt-4 border-t border-zinc-800/30">
        <div>
          <p className="text-[11px] text-zinc-500 mb-1">Total</p>
          <p className="text-lg font-semibold text-white">
            {data.reduce((sum, d) => sum + Number(d.count), 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500 mb-1">Average</p>
          <p className="text-lg font-semibold text-white">
            {Math.round(data.reduce((sum, d) => sum + Number(d.count), 0) / data.length).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500 mb-1">Peak</p>
          <p className="text-lg font-semibold text-white">{chartData.max.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500 mb-1">Period</p>
          <p className="text-lg font-semibold text-white">{data.length} days</p>
        </div>
      </div>
    </div>
  );
}
