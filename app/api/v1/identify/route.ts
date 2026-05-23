import { NextRequest, NextResponse } from 'next/server';
import { db, identities } from '@/lib/db';
import { validateApiKey } from '@/lib/api/auth';
import { z } from 'zod';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
};

const identifySchema = z.object({
  distinctId: z.string().min(1, 'distinctId is required').max(256, 'distinctId must be 256 characters or fewer'),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    const { valid, project } = await validateApiKey(authHeader);

    if (!valid || !project) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const result = identifySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid identify data', details: result.error.issues },
        { status: 400, headers: corsHeaders }
      );
    }

    const { distinctId, properties } = result.data;

    // Atomic upsert with server-side JSONB merge - no read-merge-write race.
    // The `||` operator merges JSONB shallowly: keys from `properties` override
    // existing keys, all others preserved.
    const [identity] = await db.insert(identities)
      .values({
        projectId: project.id,
        distinctId,
        properties,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [identities.projectId, identities.distinctId],
        set: {
          properties: sql`${identities.properties} || ${JSON.stringify(properties)}::jsonb`,
          lastSeenAt: new Date(),
        },
      })
      .returning({ id: identities.id });

    return NextResponse.json(
      { success: true, identityId: identity.id },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Identify error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}
