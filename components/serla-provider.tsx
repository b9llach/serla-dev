'use client';

import { useEffect } from 'react';
import { Serla } from 'serla-js';

/**
 * Dogfood: Serla tracks its own dashboard usage.
 *
 * Requires NEXT_PUBLIC_SERLA_API_KEY (a project API key from one of the
 * production projects). If unset, the provider no-ops so local dev and
 * CI builds work without the variable.
 */
export function SerlaProvider() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_SERLA_API_KEY;
    if (!apiKey) return;

    Serla.init({
      apiKey,
      host: process.env.NEXT_PUBLIC_SERLA_HOST,
      autoPageviews: true,
      // We don't enable autoClicks on our own app - too noisy.
    });
  }, []);

  return null;
}
