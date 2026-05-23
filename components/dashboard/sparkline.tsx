'use client';

import { useMemo, useId } from 'react';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  showDot?: boolean;
  showGlow?: boolean;
  animated?: boolean;
}

// Fixed heights for empty state bars (deterministic, no Math.random)
const EMPTY_BAR_HEIGHTS = [12, 18, 14, 10, 16];

export function Sparkline({
  data,
  color = '#3b82f6',
  height = 40,
  showDot = true,
  showGlow = true,
  animated = true
}: SparklineProps) {
  // Use React's useId for stable, hydration-safe IDs
  const uniqueId = useId();

  const { path, areaPath, lastPoint, gradientId, glowId } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', areaPath: '', lastPoint: null, gradientId: '', glowId: '' };
    }

    const id = uniqueId.replace(/:/g, '');
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const width = 100;
    const padding = 4;
    const effectiveHeight = height - padding * 2;
    const effectiveWidth = width - padding * 2;

    // Create smooth curve using cubic bezier
    const points = data.map((value, i) => ({
      x: padding + (i / (data.length - 1)) * effectiveWidth,
      y: padding + effectiveHeight - ((value - min) / range) * effectiveHeight,
    }));

    // Generate smooth bezier curve path
    let pathD = `M ${points[0].x},${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const tension = 0.3;

      const cp1x = prev.x + (curr.x - prev.x) * tension;
      const cp1y = prev.y;
      const cp2x = curr.x - (curr.x - prev.x) * tension;
      const cp2y = curr.y;

      pathD += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${curr.x},${curr.y}`;
    }

    // Area path for gradient fill
    const lastPt = points[points.length - 1];
    const firstPt = points[0];
    const areaD = `${pathD} L ${lastPt.x},${height - padding} L ${firstPt.x},${height - padding} Z`;

    return {
      path: pathD,
      areaPath: areaD,
      lastPoint: lastPt,
      gradientId: `spark-grad-${id}`,
      glowId: `spark-glow-${id}`,
    };
  }, [data, height, uniqueId]);

  // Need at least 2 data points for a line chart
  if (!data || data.length < 2) {
    return (
      <div
        style={{ height }}
        className="bg-zinc-800/30 rounded-lg flex items-center justify-center"
      >
        <div className="flex gap-1 items-end">
          {EMPTY_BAR_HEIGHTS.map((barHeight, i) => (
            <div
              key={i}
              className="w-1 bg-zinc-700 rounded-full"
              style={{ height: barHeight }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <defs>
        {/* Gradient fill */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>

        {/* Glow filter */}
        {showGlow && (
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Area fill */}
      <path
        d={areaPath}
        fill={`url(#${gradientId})`}
        className={animated ? 'animate-fade-in' : ''}
      />

      {/* Main line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={showGlow ? `url(#${glowId})` : undefined}
        className={animated ? 'animate-draw-line' : ''}
        style={animated ? {
          strokeDasharray: 200,
          strokeDashoffset: 200,
          animation: 'draw-line 1s ease-out forwards',
        } : undefined}
      />

      {/* End dot indicator */}
      {showDot && lastPoint && (
        <g className={animated ? 'animate-scale-in' : ''}>
          {/* Outer glow ring */}
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={6}
            fill={color}
            fillOpacity={0.2}
          />
          {/* Inner dot */}
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={3}
            fill={color}
          />
          {/* Highlight */}
          <circle
            cx={lastPoint.x - 0.5}
            cy={lastPoint.y - 0.5}
            r={1}
            fill="white"
            fillOpacity={0.6}
          />
        </g>
      )}

      <style>{`
        @keyframes draw-line {
          to { stroke-dashoffset: 0; }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out 0.8s both;
        }
        @keyframes scale-in {
          from { transform: scale(0); transform-origin: center; }
          to { transform: scale(1); transform-origin: center; }
        }
      `}</style>
    </svg>
  );
}
