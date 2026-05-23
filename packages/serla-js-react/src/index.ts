export { SerlaProvider, type SerlaProviderProps } from './SerlaProvider';
export { useSerla } from './useSerla';
export { useTrack } from './useTrack';
export { useIdentify } from './useIdentify';
export { useSuperProperties } from './useSuperProperties';
export { Track, type TrackProps } from './Track';

// Re-export the singleton + core types so consumers don't need a second import.
export { Serla } from 'serla-js';
export type { SerlaConfig, EventProperties } from 'serla-js';
