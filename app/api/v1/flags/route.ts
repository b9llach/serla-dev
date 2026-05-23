import { NextRequest, NextResponse } from 'next/server';
import { db, featureFlags, users } from '@/lib/db';
import { validateApiKey } from '@/lib/api/auth';
import { canAccess } from '@/components/dashboard/feature-gate';
import { rateLimit, rateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { evaluateFlag } from '@/lib/flags/evaluate';
import { and, eq, isNull } from 'drizzle-orm';

export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * GET /api/v1/flags?distinct_id=...&properties=base64(json)
 *
 * Returns all flags evaluated for the given user. Response shape:
 *   {
 *     flags: { [key]: boolean | string }
 *   }
 *
 * For multivariate flags, the value is the variant key. For boolean flags,
 * it's true/false.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const { valid, project } = await validateApiKey(authHeader);
  if (!valid || !project) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 401, headers: corsHeaders },
    );
  }

  // Plan gating - feature flags are Hobby+.
  const owner = await db.query.users.findFirst({
    where: and(eq(users.id, project.userId), isNull(users.deletedAt)),
    columns: { plan: true },
  });
  if (!owner || !canAccess('featureFlags', owner.plan)) {
    return NextResponse.json(
      { error: 'Feature flags require the Hobby plan or above' },
      { status: 402, headers: corsHeaders },
    );
  }

  const rateLimitResult = await rateLimit(`flags:${project.id}`, rateLimits.events);
  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult);
  }

  const distinctId = request.nextUrl.searchParams.get('distinct_id') || '';
  let properties: Record<string, unknown> = {};
  const propsParam = request.nextUrl.searchParams.get('properties');
  if (propsParam) {
    try {
      properties = JSON.parse(Buffer.from(propsParam, 'base64').toString('utf-8'));
    } catch {
      // Malformed properties param - just ignore.
    }
  }

  const flags = await db.query.featureFlags.findMany({
    where: eq(featureFlags.projectId, project.id),
  });

  const out: Record<string, boolean | string> = {};
  for (const flag of flags) {
    const result = evaluateFlag(flag, { distinctId, properties });
    out[flag.key] = result.value;
  }

  return NextResponse.json(
    { flags: out },
    {
      status: 200,
      headers: {
        ...corsHeaders,
        // Cache lightly so client SDKs can debounce - 30s is short enough that
        // newly-toggled flags propagate fast.
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=30',
      },
    },
  );
}
