import { useEffect, type ReactNode } from 'react';
import { Serla, type SerlaConfig } from 'serla-js';
import { SerlaContext } from './context';

export interface SerlaProviderProps {
  /** Config forwarded to Serla.init(). Only read on mount - changes are ignored. */
  config: SerlaConfig;
  children?: ReactNode;
}

/**
 * Initializes Serla on mount and tears it down on unmount.
 *
 * Notes on StrictMode (dev only): React mounts effects twice. This means
 * init -> shutdown -> init in development, which is acceptable: shutdown
 * clears state, init re-creates it. In production this runs exactly once.
 *
 * The `config` prop is intentionally read only on mount. Changing apiKey or
 * autoPageviews mid-session is not supported by the core SDK, so we don't
 * pretend to support it here.
 */
export function SerlaProvider({ config, children }: SerlaProviderProps) {
  useEffect(() => {
    Serla.init(config);
    return () => {
      Serla.shutdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <SerlaContext.Provider value={true}>{children}</SerlaContext.Provider>;
}
