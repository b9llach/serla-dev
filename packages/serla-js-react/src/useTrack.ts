import { useCallback } from 'react';
import { Serla, type EventProperties } from 'serla-js';

/**
 * Returns a stable track function bound to a default event name. The returned
 * function takes optional per-call properties that are merged on top.
 *
 *   const trackClick = useTrack('cta_clicked');
 *   <button onClick={() => trackClick({ variant: 'hero' })}>Click</button>
 */
export function useTrack(name: string): (properties?: EventProperties) => void {
  return useCallback(
    (properties?: EventProperties) => {
      Serla.track(name, properties);
    },
    [name]
  );
}
