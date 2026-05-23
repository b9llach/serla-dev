import { useContext } from 'react';
import { Serla } from 'serla-js';
import { SerlaContext } from './context';

let warnedNoProvider = false;

/**
 * Returns the Serla singleton. Works without a provider, but warns once in
 * development if no <SerlaProvider> is mounted - calling track() before
 * init() is almost always a bug.
 */
export function useSerla(): typeof Serla {
  const hasProvider = useContext(SerlaContext);
  if (!hasProvider && !warnedNoProvider && process.env.NODE_ENV !== 'production') {
    warnedNoProvider = true;
    if (typeof console !== 'undefined') {
      console.warn(
        '[serla-js-react] useSerla() called outside <SerlaProvider>. ' +
          'Serla.init() was never called - tracking will no-op. ' +
          'Wrap your tree in <SerlaProvider config={{ apiKey: "..." }}>.'
      );
    }
  }
  return Serla;
}
