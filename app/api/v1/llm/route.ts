import { NextRequest, NextResponse } from 'next/server';
import { db, llmGenerations, users } from '@/lib/db';
import { validateApiKeyWithLimits } from '@/lib/api/auth';
import { canAccess } from '@/lib/plans/features';
import { rateLimit, rateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { computeCost } from '@/lib/llm/pricing';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';

export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
};

const generationSchema = z.object({
  distinctId: z.string().max(200).optional().nullable(),
  traceId: z.string().max(200).optional().nullable(),
  parentId: z.string().max(200).optional().nullable(),
  model: z.string().min(1).max(200),
  provider: z.string().max(50).optional().nullable(),
  input: z.unknown().optional().nullable(),
  output: z.unknown().optional().nullable(),
  inputTokens: z.number().int().nonnegative().optional().nullable(),
  outputTokens: z.number().int().nonnegative().optional().nullable(),
  totalTokens: z.number().int().nonnegative().optional().nullable(),
  costUsd: z.number().nonnegative().optional().nullable(),
  latencyMs: z.number().int().nonnegative().optional().nullable(),
  status: z.enum(['success', 'error']).default('success'),
  errorMessage: z.string().max(2000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  timestamp: z.string().datetime().optional().nullable(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { valid, project, withinLimits, limitError } = await validateApiKeyWithLimits(authHeader);
    if (!valid || !project) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders },
      );
    }

    const owner = await db.query.users.findFirst({
      where: and(eq(users.id, project.userId), isNull(users.deletedAt)),
      columns: { plan: true },
    });
    if (!owner || !canAccess('llmObservability', owner.plan)) {
      return NextResponse.json(
        { error: 'LLM observability requires the Hobby plan or above' },
        { status: 402, headers: corsHeaders },
      );
    }

    const rateLimitResult = await rateLimit(`llm:${project.id}`, rateLimits.events);
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    // Monthly plan volume applies to these writes too - otherwise replay
    // blobs, error events and LLM rows are an uncapped storage cost on
    // every tier while only /events counts toward the quota.
    if (!withinLimits) {
      return NextResponse.json(
        { error: 'Monthly limit exceeded', message: limitError },
        { status: 429, headers: corsHeaders },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: corsHeaders },
      );
    }

    const parsed = generationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid generation', details: parsed.error.issues },
        { status: 400, headers: corsHeaders },
      );
    }
    const gen = parsed.data;

    // Cap the prompt/completion payload. `input` and `output` are free-form
    // JSON, so without a limit a single request can push an arbitrarily large
    // jsonb value into the table. Vercel's 4.5MB body cap masks this on one
    // deployment target; self-hosted Node has no such ceiling.
    const MAX_IO_BYTES = 256 * 1024;
    const ioBytes =
      Buffer.byteLength(JSON.stringify(gen.input ?? null), 'utf-8') +
      Buffer.byteLength(JSON.stringify(gen.output ?? null), 'utf-8');
    if (ioBytes > MAX_IO_BYTES) {
      return NextResponse.json(
        {
          error: 'Payload too large',
          message: `input + output must be under ${MAX_IO_BYTES / 1024}KB (got ${Math.round(ioBytes / 1024)}KB). Truncate the prompt or store it in your own system and send a reference in metadata.`,
        },
        { status: 413, headers: corsHeaders },
      );
    }

    // Backfill cost if the SDK didn't compute one and we have token counts.
    let costUsd = gen.costUsd ?? null;
    if (costUsd == null && gen.inputTokens != null && gen.outputTokens != null) {
      costUsd = computeCost(gen.model, gen.inputTokens, gen.outputTokens);
    }

    // Backfill totalTokens if not provided.
    const totalTokens =
      gen.totalTokens ?? (((gen.inputTokens ?? 0) + (gen.outputTokens ?? 0)) || null);

    await db.insert(llmGenerations).values({
      projectId: project.id,
      distinctId: gen.distinctId ?? undefined,
      traceId: gen.traceId ?? undefined,
      parentId: gen.parentId ?? undefined,
      model: gen.model,
      provider: gen.provider ?? undefined,
      input: (gen.input ?? null) as unknown as object,
      output: (gen.output ?? null) as unknown as object,
      inputTokens: gen.inputTokens ?? undefined,
      outputTokens: gen.outputTokens ?? undefined,
      totalTokens: totalTokens ?? undefined,
      costUsd: costUsd != null ? costUsd.toString() : undefined,
      latencyMs: gen.latencyMs ?? undefined,
      status: gen.status,
      errorMessage: gen.errorMessage ?? undefined,
      metadata: (gen.metadata ?? {}) as Record<string, unknown>,
      timestamp: gen.timestamp ? new Date(gen.timestamp) : new Date(),
    });

    return NextResponse.json(
      { success: true },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error('[llm] Ingestion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
