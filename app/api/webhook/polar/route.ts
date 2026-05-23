import { Webhooks } from '@polar-sh/nextjs';
import { db, users, processedWebhookEvents } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { getPlanFromProductId } from '@/lib/polar/client';

const PLAN_RANK: Record<string, number> = { free: 0, hobby: 1, pro: 2, max: 3 };

// Deterministic key for dedup: same physical event retry produces same key.
// Different state transitions (active → canceled) have different modifiedAt.
function makeEventKey(parts: Array<string | Date | null | undefined>): string {
  return parts.map(p => {
    if (p instanceof Date) return p.toISOString();
    return p ?? 'null';
  }).join(':');
}

// Insert event marker; returns true if this was a new event (first time processed).
async function claimEvent(provider: string, eventKey: string): Promise<boolean> {
  const inserted = await db
    .insert(processedWebhookEvents)
    .values({ provider, eventKey })
    .onConflictDoNothing({ target: [processedWebhookEvents.provider, processedWebhookEvents.eventKey] })
    .returning({ id: processedWebhookEvents.id });
  return inserted.length > 0;
}

// Find the highest-tier active subscription and return its plan + id.
function bestActiveSubscription(
  activeSubscriptions: Array<{ id: string; productId: string }>
): { plan: string; subscriptionId: string | null } {
  let bestPlan = 'free';
  let bestSubId: string | null = null;
  for (const sub of activeSubscriptions) {
    const plan = getPlanFromProductId(sub.productId) || 'free';
    if ((PLAN_RANK[plan] ?? 0) > (PLAN_RANK[bestPlan] ?? 0)) {
      bestPlan = plan;
      bestSubId = sub.id;
    }
  }
  return { plan: bestPlan, subscriptionId: bestSubId };
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

  // Handle subscription becoming active
  onSubscriptionActive: async (payload) => {
    const { customerId, productId } = payload.data;

    if (!customerId || !productId) {
      console.error('Missing customerId or productId in subscription.active');
      return;
    }

    const externalId = payload.data.customer?.externalId;
    if (!externalId) {
      console.error('No external ID found for customer:', customerId);
      return;
    }

    const eventKey = makeEventKey([payload.type, payload.data.id, payload.data.modifiedAt ?? payload.data.createdAt]);
    if (!(await claimEvent('polar', eventKey))) {
      console.log(`Skipping duplicate webhook: ${eventKey}`);
      return;
    }

    const plan = getPlanFromProductId(productId) || 'free';

    await db
      .update(users)
      .set({
        plan,
        polarCustomerId: customerId,
        polarSubscriptionId: payload.data.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, externalId));

    console.log(`Subscription activated for user ${externalId}, plan: ${plan}`);
  },

  // Handle subscription cancellation
  onSubscriptionCanceled: async (payload) => {
    const externalId = payload.data.customer?.externalId;
    if (!externalId) {
      console.error('No external ID found for canceled subscription');
      return;
    }

    const eventKey = makeEventKey([payload.type, payload.data.id, payload.data.modifiedAt ?? payload.data.createdAt]);
    if (!(await claimEvent('polar', eventKey))) {
      console.log(`Skipping duplicate webhook: ${eventKey}`);
      return;
    }

    // Only clear plan/subscription if this matches the user's CURRENT active subscription.
    // This avoids old cancellation events overwriting a newer active subscription.
    await db
      .update(users)
      .set({
        plan: 'free',
        polarSubscriptionId: null,
        updatedAt: new Date(),
      })
      .where(sql`${users.id} = ${externalId} AND ${users.polarSubscriptionId} = ${payload.data.id}`);

    console.log(`Subscription canceled for user ${externalId}, downgraded to free`);
  },

  // Handle subscription revoked (immediate cancellation)
  onSubscriptionRevoked: async (payload) => {
    const externalId = payload.data.customer?.externalId;
    if (!externalId) {
      console.error('No external ID found for revoked subscription');
      return;
    }

    const eventKey = makeEventKey([payload.type, payload.data.id, payload.data.modifiedAt ?? payload.data.createdAt]);
    if (!(await claimEvent('polar', eventKey))) {
      console.log(`Skipping duplicate webhook: ${eventKey}`);
      return;
    }

    await db
      .update(users)
      .set({
        plan: 'free',
        polarSubscriptionId: null,
        updatedAt: new Date(),
      })
      .where(sql`${users.id} = ${externalId} AND ${users.polarSubscriptionId} = ${payload.data.id}`);

    console.log(`Subscription revoked for user ${externalId}, downgraded to free`);
  },

  // Handle subscription updates (plan changes)
  onSubscriptionUpdated: async (payload) => {
    const { productId } = payload.data;
    const externalId = payload.data.customer?.externalId;

    if (!externalId || !productId) {
      return;
    }

    const eventKey = makeEventKey([payload.type, payload.data.id, payload.data.modifiedAt ?? payload.data.createdAt]);
    if (!(await claimEvent('polar', eventKey))) {
      console.log(`Skipping duplicate webhook: ${eventKey}`);
      return;
    }

    const plan = getPlanFromProductId(productId) || 'free';

    // Only apply this update if it targets the user's current subscription ID.
    await db
      .update(users)
      .set({
        plan,
        updatedAt: new Date(),
      })
      .where(sql`${users.id} = ${externalId} AND ${users.polarSubscriptionId} = ${payload.data.id}`);

    console.log(`Subscription updated for user ${externalId}, new plan: ${plan}`);
  },

  // Handle customer state changes (authoritative state update)
  onCustomerStateChanged: async (payload) => {
    const externalId = payload.data.externalId;
    if (!externalId) {
      return;
    }

    const eventKey = makeEventKey(['customer.state_changed', payload.data.id, payload.data.modifiedAt ?? payload.data.createdAt]);
    if (!(await claimEvent('polar', eventKey))) {
      console.log(`Skipping duplicate webhook: ${eventKey}`);
      return;
    }

    const activeSubscriptions = payload.data.activeSubscriptions || [];

    if (activeSubscriptions.length === 0) {
      await db
        .update(users)
        .set({
          plan: 'free',
          polarSubscriptionId: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, externalId));
    } else {
      // Pick highest-tier subscription, not the first one.
      const { plan, subscriptionId } = bestActiveSubscription(activeSubscriptions);
      await db
        .update(users)
        .set({
          plan,
          polarCustomerId: payload.data.id,
          polarSubscriptionId: subscriptionId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, externalId));
    }
  },

  // Handle order paid (one-time purchases or subscription orders)
  onOrderPaid: async (payload) => {
    console.log('Order paid:', payload.data.id);
  },
});
