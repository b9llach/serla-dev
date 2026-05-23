import { useEffect } from 'react';
import { Serla, type EventProperties } from 'serla-js';

export interface TrackProps {
  /** Event name to fire on mount. */
  event: string;
  /** Optional event properties. */
  properties?: EventProperties;
}

/**
 * Declarative one-shot tracker. Fires `event` exactly once on mount.
 *
 *   <Track event="upgrade_modal_viewed" properties={{ plan: 'pro' }} />
 *
 * In React StrictMode (dev) this fires twice, like any mount effect. That's
 * accepted - dev environments are not the source of analytics truth.
 */
export function Track({ event, properties }: TrackProps): null {
  useEffect(() => {
    Serla.track(event, properties);
    // Intentionally empty deps: this is a one-shot on-mount event. If callers
    // need to fire on every render they can use useTrack() instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
