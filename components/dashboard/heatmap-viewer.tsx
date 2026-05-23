'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Upload, X, Info } from 'lucide-react';

interface ElementClick {
  selector: string;
  count: number;
  /** 0..1 percentile within viewport when hasViewport=true, raw pixels otherwise */
  meanX: number;
  meanY: number;
  hasViewport: boolean;
}

interface Props {
  pagePath: string;
  elements: ElementClick[];
}

/**
 * Heatmap viewer.
 *
 * Two coexisting views:
 *  - Ranked list of clicked element selectors with counts (left)
 *  - Optional screenshot overlay with click density dots (right)
 *
 * Screenshots live entirely in the browser via FileReader -> object URL.
 * Nothing uploaded server-side - we don't want to host arbitrary user
 * screenshots, and the value of "see clicks on YOUR page" doesn't require
 * persistence.
 */
export function HeatmapViewer({ pagePath, elements }: Props) {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Revoke object URLs on unmount/change to avoid memory leaks.
  useEffect(() => {
    return () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    };
  }, [screenshotUrl]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    setScreenshotUrl(URL.createObjectURL(file));
  };

  const clearScreenshot = () => {
    if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    setScreenshotUrl(null);
    setImgSize(null);
  };

  // Max count for sizing dot weights.
  const maxCount = elements[0]?.count ?? 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-sm font-mono truncate">{pagePath}</CardTitle>
              <CardDescription className="text-xs">
                Top clicked elements
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUpload}
                  className="hidden"
                />
                <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors">
                  <Upload className="h-3 w-3" />
                  {screenshotUrl ? 'Replace screenshot' : 'Upload screenshot'}
                </span>
              </label>
              {screenshotUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearScreenshot}
                  className="h-7 px-2"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {screenshotUrl && (
            <div
              ref={containerRef}
              className="relative w-full rounded-md overflow-hidden border border-zinc-800 mb-4 bg-zinc-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotUrl}
                alt={`Screenshot of ${pagePath}`}
                className="w-full h-auto block"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
                }}
              />
              {imgSize && (
                <svg
                  viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  {elements.map((el, i) => {
                    if (!el.hasViewport) return null;
                    const x = el.meanX * imgSize.w;
                    const y = el.meanY * imgSize.h;
                    const intensity = el.count / maxCount;
                    const radius = 20 + intensity * 60;
                    return (
                      <g key={i}>
                        <circle
                          cx={x}
                          cy={y}
                          r={radius}
                          fill="rgba(239, 68, 68, 0.25)"
                        />
                        <circle
                          cx={x}
                          cy={y}
                          r={4}
                          fill="rgba(239, 68, 68, 0.9)"
                        />
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          )}

          {!screenshotUrl && (
            <div className="flex items-start gap-2 rounded-md border border-zinc-800/50 bg-[#0f0f0f] p-3 text-xs text-zinc-500 mb-4">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>
                Upload a screenshot of <span className="font-mono">{pagePath}</span> to see clicks overlaid on the page. Screenshots stay in your browser - nothing is uploaded.
              </p>
            </div>
          )}

          <div className="space-y-1">
            {elements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No element-level click data for this page.
              </p>
            ) : (
              elements.map((el) => {
                const widthPct = (el.count / maxCount) * 100;
                return (
                  <div key={el.selector} className="relative bg-zinc-800/20 rounded-md overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-blue-500/15"
                      style={{ width: `${widthPct}%` }}
                    />
                    <div className="relative flex items-center justify-between px-3 py-2 gap-2">
                      <code className="text-xs text-zinc-300 truncate font-mono">{el.selector}</code>
                      <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                        {el.count.toLocaleString()}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
