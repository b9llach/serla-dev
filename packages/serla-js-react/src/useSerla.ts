import { useContext, useEffect } from 'react';
import { Serla } from 'serla-js';
import { SerlaContext } from './context';

let warnedNoProvider = false;

/**
 * Dev-only, fires at most once per page load. Kept outside the hook body so
 * we never reassign module scope from inside a component render - the React
 * Compiler rejects that, and it would be unsafe under concurrent rendering.
 */
function warnMissingProviderOnce(): void {
  if (warnedNoProvider || process.env.NODE_ENV === 'production') return;
  warnedNoProvider = true;
  if (typeof console !== 'undefined') {
    console.warn(
      '[serla-js-react] useSerla() called outside <SerlaProvider>. ' +
        'Serla.init() was never called - tracking will no-op. ' +
        'Wrap your tree in <SerlaProvider config={{ apiKey: "..." }}>.'
    );
  }
}

/**
 * Returns the Serla singleton. Works without a provider, but warns once in
 * development if no <SerlaProvider> is mounted - calling track() before
 * init() is almost always a bug.
 */
export function useSerla(): typeof Serla {
  const hasProvider = useContext(SerlaContext);
  useEffect(() => {
    if (!hasProvider) warnMissingProviderOnce();
  }, [hasProvider]);
  return Serla;
}
