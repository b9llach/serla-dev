import { UAParser } from 'ua-parser-js';

export interface EnrichmentData {
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  device?: string;
  deviceType?: string;
  country?: string;
  city?: string;
  region?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrerDomain?: string;
}

export function parseUserAgent(userAgent: string | null): Partial<EnrichmentData> {
  if (!userAgent) return {};

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  let deviceType: string | undefined;
  if (result.device.type) {
    deviceType = result.device.type;
  } else {
    // Default to desktop if no device type detected
    deviceType = 'desktop';
  }

  return {
    browser: result.browser.name,
    browserVersion: result.browser.version,
    os: result.os.name,
    osVersion: result.os.version,
    device: result.device.model || result.device.vendor,
    deviceType,
  };
}

export function extractUtmParams(url: string | null): Partial<EnrichmentData> {
  if (!url) return {};

  try {
    const urlObj = new URL(url);
    return {
      utmSource: urlObj.searchParams.get('utm_source') || undefined,
      utmMedium: urlObj.searchParams.get('utm_medium') || undefined,
      utmCampaign: urlObj.searchParams.get('utm_campaign') || undefined,
      utmTerm: urlObj.searchParams.get('utm_term') || undefined,
      utmContent: urlObj.searchParams.get('utm_content') || undefined,
    };
  } catch {
    return {};
  }
}

export function extractReferrerDomain(referrer: string | null): string | undefined {
  if (!referrer) return undefined;

  try {
    const url = new URL(referrer);
    return url.hostname;
  } catch {
    return undefined;
  }
}

export function getGeoFromHeaders(headers: Headers): Partial<EnrichmentData> {
  // Vercel provides geo headers
  // Also support Cloudflare headers
  return {
    country: headers.get('x-vercel-ip-country') || headers.get('cf-ipcountry') || undefined,
    city: headers.get('x-vercel-ip-city') || headers.get('cf-ipcity') || undefined,
    region: headers.get('x-vercel-ip-country-region') || undefined,
  };
}

export function enrichEvent(
  userAgent: string | null,
  pageUrl: string | null,
  referrer: string | null,
  headers: Headers
): EnrichmentData {
  const uaData = parseUserAgent(userAgent);
  const utmData = extractUtmParams(pageUrl);
  const geoData = getGeoFromHeaders(headers);
  const referrerDomain = extractReferrerDomain(referrer);

  return {
    ...uaData,
    ...utmData,
    ...geoData,
    referrerDomain,
  };
}

export function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
