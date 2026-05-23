/**
 * Read a date range from search params. Used by dashboard pages that accept
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD. Falls back to (now - defaultDays, now).
 *
 * Both bounds are at UTC midnight. The returned `to` represents END-OF-DAY -
 * i.e., includes the entire day. Callers should use lt(timestamp, to) for
 * half-open intervals.
 */
export function parseRangeFromSearchParams(
  searchParams: { from?: string; to?: string } | URLSearchParams | undefined,
  defaultDays = 7
): { from: Date; to: Date } {
  const fromStr = isURLSearchParams(searchParams)
    ? searchParams.get('from') ?? undefined
    : searchParams?.from;
  const toStr = isURLSearchParams(searchParams)
    ? searchParams.get('to') ?? undefined
    : searchParams?.to;

  const now = new Date();
  // End-of-day on `to` so events from that day are included.
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const defaultFrom = new Date(defaultTo.getTime() - defaultDays * 86_400_000);

  let from = defaultFrom;
  let to = defaultTo;

  if (fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
    const parts = fromStr.split('-').map(Number);
    if (parts[0] && parts[1] && parts[2]) {
      from = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    }
  }
  if (toStr && /^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    const parts = toStr.split('-').map(Number);
    if (parts[0] && parts[1] && parts[2]) {
      // Inclusive end-of-day: bump to start of next day so half-open lt() works.
      to = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
    }
  }

  // Guardrails: from must precede to, and we cap to a 2-year window so no one
  // accidentally scans all events.
  if (from.getTime() >= to.getTime()) from = new Date(to.getTime() - 86_400_000);
  const maxWindow = 365 * 2 * 86_400_000;
  if (to.getTime() - from.getTime() > maxWindow) {
    from = new Date(to.getTime() - maxWindow);
  }

  return { from, to };
}

function isURLSearchParams(o: unknown): o is URLSearchParams {
  return o instanceof URLSearchParams;
}
