"use client";

import { useEffect, useRef, useMemo } from "react";
import createGlobe, { COBEOptions } from "cobe";
import { cn } from "@/lib/utils";

export interface GlobeMarker {
  location: [number, number]; // [latitude, longitude]
  size: number;
}

export interface GlobeProps {
  className?: string;
  dark?: number;
  diffuse?: number;
  mapSamples?: number;
  mapBrightness?: number;
  baseColor?: [number, number, number];
  markerColor?: [number, number, number];
  glowColor?: [number, number, number];
  scale?: number;
  markers?: GlobeMarker[];
}

export function Globe({
  className,
  dark = 1,
  diffuse = 0.4,
  mapSamples = 16000,
  mapBrightness = 1.2,
  baseColor = [0.3, 0.3, 0.3],
  markerColor = [0.1, 0.8, 1],
  glowColor = [0.1, 0.1, 0.1],
  scale = 1,
  markers = [],
}: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3); // Vertical angle
  const rotationRef = useRef(0); // Horizontal rotation offset
  const thetaOffsetRef = useRef(0); // Vertical rotation offset
  const markersRef = useRef<GlobeMarker[]>(markers);
  const globeInstanceRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const isMountedRef = useRef(false);

  // Keep markers ref updated without causing re-renders
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  // Memoize config to prevent unnecessary recreations
  const configHash = useMemo(() => {
    return JSON.stringify({ dark, diffuse, mapSamples, mapBrightness, baseColor, markerColor, glowColor, scale });
  }, [dark, diffuse, mapSamples, mapBrightness, baseColor, markerColor, glowColor, scale]);

  useEffect(() => {
    // Guard against double initialization
    if (isMountedRef.current || !canvasRef.current) {
      return;
    }
    isMountedRef.current = true;

    const canvas = canvasRef.current;
    let width = canvas.offsetWidth;

    const onResize = () => {
      if (canvas) {
        width = canvas.offsetWidth;
      }
    };

    // Handle pointer move at window level so dragging continues outside globe
    const onPointerMove = (e: PointerEvent) => {
      if (pointerStart.current !== null) {
        const deltaX = e.clientX - pointerStart.current.x;
        const deltaY = e.clientY - pointerStart.current.y;
        rotationRef.current += deltaX / 200; // Horizontal rotation
        thetaOffsetRef.current += deltaY / 300; // Vertical rotation (slightly slower)
        // Clamp theta to prevent flipping over the poles
        thetaOffsetRef.current = Math.max(-1.2, Math.min(1.2, thetaOffsetRef.current));
        pointerStart.current = { x: e.clientX, y: e.clientY };
      }
    };

    // Handle pointer up at window level so we catch release anywhere
    const onPointerUp = () => {
      if (pointerStart.current !== null) {
        pointerStart.current = null;
        if (canvas) {
          canvas.style.cursor = "grab";
        }
      }
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // Create the globe
    let hasRendered = false;
    const globe = createGlobe(canvas, {
      width: width * 2,
      height: width * 2,
      devicePixelRatio: 2,
      phi: 0,
      theta: 0.3,
      dark,
      diffuse,
      mapSamples,
      mapBrightness,
      baseColor,
      markerColor,
      glowColor,
      scale,
      markers: markersRef.current,
      onRender: (state) => {
        // Show and fade in after first render
        if (!hasRendered) {
          hasRendered = true;
          canvas.style.visibility = "visible";
          canvas.style.opacity = "1";
        }
        state.phi = phiRef.current + rotationRef.current;
        state.theta = thetaRef.current + thetaOffsetRef.current;
        state.width = width * 2;
        state.height = width * 2;
        state.markers = markersRef.current;
      },
    });

    globeInstanceRef.current = globe;

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (globeInstanceRef.current) {
        globeInstanceRef.current.destroy();
        globeInstanceRef.current = null;
      }
    };
  }, [configHash]); // Only recreate if config actually changes

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    if (canvasRef.current) {
      canvasRef.current.style.cursor = "grabbing";
    }
  };

  return (
    <div
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[600px]",
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="size-full transition-opacity duration-500 cursor-grab"
        style={{ contain: "layout paint size", visibility: "hidden", opacity: 0 }}
        onPointerDown={handlePointerDown}
      />
    </div>
  );
}

// Country code to coordinates mapping (capital cities)
export const COUNTRY_COORDINATES: Record<string, [number, number]> = {
  // North America
  US: [38.8951, -77.0364],
  CA: [45.4215, -75.6972],
  MX: [19.4326, -99.1332],
  // South America
  BR: [-15.7975, -47.8919],
  AR: [-34.6037, -58.3816],
  CO: [4.7110, -74.0721],
  CL: [-33.4489, -70.6693],
  PE: [-12.0464, -77.0428],
  // Europe
  GB: [51.5074, -0.1278],
  DE: [52.5200, 13.4050],
  FR: [48.8566, 2.3522],
  IT: [41.9028, 12.4964],
  ES: [40.4168, -3.7038],
  NL: [52.3676, 4.9041],
  BE: [50.8503, 4.3517],
  PT: [38.7223, -9.1393],
  PL: [52.2297, 21.0122],
  SE: [59.3293, 18.0686],
  NO: [59.9139, 10.7522],
  DK: [55.6761, 12.5683],
  FI: [60.1699, 24.9384],
  AT: [48.2082, 16.3738],
  CH: [46.9480, 7.4474],
  IE: [53.3498, -6.2603],
  CZ: [50.0755, 14.4378],
  RO: [44.4268, 26.1025],
  HU: [47.4979, 19.0402],
  GR: [37.9838, 23.7275],
  UA: [50.4501, 30.5234],
  RU: [55.7558, 37.6173],
  // Asia
  CN: [39.9042, 116.4074],
  JP: [35.6762, 139.6503],
  KR: [37.5665, 126.9780],
  IN: [28.6139, 77.2090],
  SG: [1.3521, 103.8198],
  HK: [22.3193, 114.1694],
  TW: [25.0330, 121.5654],
  TH: [13.7563, 100.5018],
  VN: [21.0285, 105.8542],
  MY: [3.1390, 101.6869],
  ID: [-6.2088, 106.8456],
  PH: [14.5995, 120.9842],
  PK: [33.6844, 73.0479],
  BD: [23.8103, 90.4125],
  AE: [24.4539, 54.3773],
  SA: [24.7136, 46.6753],
  IL: [31.7683, 35.2137],
  TR: [39.9334, 32.8597],
  // Oceania
  AU: [-35.2809, 149.1300],
  NZ: [-41.2866, 174.7756],
  // Africa
  ZA: [-25.7461, 28.1881],
  EG: [30.0444, 31.2357],
  NG: [9.0765, 7.3986],
  KE: [-1.2921, 36.8219],
  MA: [33.9716, -6.8498],
  // Default/Unknown
  XX: [0, 0],
};

// Convert country code to marker
export function countryToMarker(
  countryCode: string,
  eventCount: number,
  maxCount: number
): GlobeMarker | null {
  const coords = COUNTRY_COORDINATES[countryCode.toUpperCase()];
  if (!coords) return null;

  const normalizedSize = Math.min(eventCount / maxCount, 1);
  const size = 0.01 + normalizedSize * 0.04;

  return {
    location: coords,
    size,
  };
}

// Convert event distribution to markers
export function eventsToMarkers(
  countryDistribution: { country: string; count: number }[]
): GlobeMarker[] {
  if (countryDistribution.length === 0) return [];

  const maxCount = Math.max(...countryDistribution.map((c) => c.count));

  return countryDistribution
    .map((c) => countryToMarker(c.country, c.count, maxCount))
    .filter((m): m is GlobeMarker => m !== null);
}
