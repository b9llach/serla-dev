'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Globe, eventsToMarkers, GlobeMarker, COUNTRY_COORDINATES } from '@/components/ui/globe';
import { useRealtimeEvent, RealtimeEvent } from '@/lib/contexts/realtime-context';
import { cn } from '@/lib/utils';

interface CountryData {
  country: string;
  count: number;
}

interface EventGlobeProps {
  initialData: CountryData[];
  className?: string;
}

interface PulseMarker {
  id: string;
  location: [number, number];
  size: number;
  createdAt: number;
  ring: number; // 0 = center dot, 1-3 = expanding rings
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  MX: 'Mexico',
  BR: 'Brazil',
  AR: 'Argentina',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  NL: 'Netherlands',
  BE: 'Belgium',
  PT: 'Portugal',
  PL: 'Poland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  AT: 'Austria',
  CH: 'Switzerland',
  IE: 'Ireland',
  CZ: 'Czechia',
  RO: 'Romania',
  HU: 'Hungary',
  GR: 'Greece',
  UA: 'Ukraine',
  RU: 'Russia',
  CN: 'China',
  JP: 'Japan',
  KR: 'South Korea',
  IN: 'India',
  SG: 'Singapore',
  HK: 'Hong Kong',
  TW: 'Taiwan',
  TH: 'Thailand',
  VN: 'Vietnam',
  MY: 'Malaysia',
  ID: 'Indonesia',
  PH: 'Philippines',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  AE: 'UAE',
  SA: 'Saudi Arabia',
  IL: 'Israel',
  TR: 'Turkey',
  AU: 'Australia',
  NZ: 'New Zealand',
  ZA: 'South Africa',
  EG: 'Egypt',
  NG: 'Nigeria',
  KE: 'Kenya',
  MA: 'Morocco',
  CO: 'Colombia',
  CL: 'Chile',
  PE: 'Peru',
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

export function EventGlobe({ initialData, className }: EventGlobeProps) {
  const [countryData, setCountryData] = useState<CountryData[]>(initialData);
  const [pulseMarkers, setPulseMarkers] = useState<PulseMarker[]>([]);
  const animationRef = useRef<number | null>(null);

  // Compute base markers from country data
  const baseMarkers = useMemo(() => eventsToMarkers(countryData), [countryData]);

  // Combine base markers with pulse markers
  const allMarkers = useMemo(() => {
    return [
      ...baseMarkers,
      ...pulseMarkers.map(p => ({ location: p.location, size: p.size })),
    ];
  }, [baseMarkers, pulseMarkers]);

  // Animate pulse markers - expanding rings effect
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      setPulseMarkers(prev => {
        const updated = prev
          .map(marker => {
            const age = now - marker.createdAt;
            const duration = 1500; // 1.5 seconds per ring
            const progress = age / duration;

            if (progress >= 1) return null;

            // Different behavior for center dot vs rings
            if (marker.ring === 0) {
              // Center dot: starts big and shrinks
              const newSize = 0.25 * (1 - progress);
              return { ...marker, size: newSize };
            } else {
              // Rings: expand outward then fade
              // Each ring starts at different delay
              const ringDelay = marker.ring * 0.15; // Stagger rings
              const adjustedProgress = Math.max(0, (progress - ringDelay) / (1 - ringDelay));

              if (adjustedProgress <= 0) {
                return { ...marker, size: 0 }; // Not visible yet
              }

              // Expand from 0.1 to 0.5, then shrink
              const expandPhase = Math.min(adjustedProgress * 2, 1); // First half: expand
              const fadePhase = Math.max(0, (adjustedProgress - 0.5) * 2); // Second half: fade
              const newSize = 0.1 + (expandPhase * 0.4) * (1 - fadePhase * 0.8);

              return { ...marker, size: Math.max(0, newSize) };
            }
          })
          .filter((m): m is PulseMarker => m !== null);

        return updated;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Handle new realtime events
  const handleNewEvent = useCallback((event: RealtimeEvent) => {
    const country = event.country;
    if (!country) return;

    const coords = COUNTRY_COORDINATES[country.toUpperCase()];
    if (!coords) return;

    const now = Date.now();
    const baseId = `pulse-${now}-${Math.random()}`;

    // Create center dot + 3 expanding rings for ripple effect
    const newMarkers: PulseMarker[] = [
      { id: `${baseId}-0`, location: coords, size: 0.25, createdAt: now, ring: 0 },
      { id: `${baseId}-1`, location: coords, size: 0, createdAt: now, ring: 1 },
      { id: `${baseId}-2`, location: coords, size: 0, createdAt: now, ring: 2 },
      { id: `${baseId}-3`, location: coords, size: 0, createdAt: now, ring: 3 },
    ];

    setPulseMarkers(prev => [...prev, ...newMarkers]);

    // Update country data count
    setCountryData(prev => {
      const existing = prev.find(c => c.country === country);
      if (existing) {
        return prev.map(c =>
          c.country === country ? { ...c, count: c.count + 1 } : c
        );
      } else {
        return [...prev, { country, count: 1 }].sort((a, b) => b.count - a.count);
      }
    });
  }, []);

  useRealtimeEvent(handleNewEvent);

  const topCountries = countryData.slice(0, 5);
  const hasData = baseMarkers.length > 0 || pulseMarkers.length > 0;

  return (
    <div className={cn("relative", className)}>
      {/* Globe */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Globe
          className="w-full max-w-[380px] lg:max-w-[420px]"
          markers={allMarkers}
          dark={1}
          diffuse={0.6}
          mapSamples={16000}
          mapBrightness={4}
          baseColor={[0.15, 0.15, 0.15]}
          markerColor={[0.1, 0.8, 1]}
          glowColor={[0, 0, 0]}
          scale={1.15}
        />
      </div>

      {/* Empty state overlay */}
      {!hasData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-6">
          <p className="text-zinc-400 text-sm">No geographic data yet</p>
          <p className="text-zinc-600 text-xs mt-1 max-w-xs">
            Geographic data appears once events include location info
          </p>
        </div>
      )}

      {/* Country list overlay - top left */}
      {topCountries.length > 0 && (
        <div className="absolute top-0 left-0 z-10">
          <div className="text-xs text-zinc-500 mb-2">Top Locations</div>
          <div className="space-y-1.5">
            {topCountries.map((c) => (
              <div key={c.country} className="flex items-center justify-between gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                  <span className="text-zinc-300">{getCountryName(c.country)}</span>
                </div>
                <span className="text-zinc-500 tabular-nums">{c.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
