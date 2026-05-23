import { timingSafeEqual } from 'crypto';

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  // If lengths differ, still do comparison to avoid timing leak
  if (bufA.length !== bufB.length) {
    // Compare bufA with itself to maintain constant time
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Validate cron secret from authorization header
 */
export function validateCronSecret(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set');
    return false;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const providedSecret = authHeader.substring(7);
  return safeCompare(providedSecret, cronSecret);
}
