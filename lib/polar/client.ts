import { Polar } from '@polar-sh/sdk';

// Initialize Polar client
export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: process.env.POLAR_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production',
});

export type BillingPeriod = 'monthly' | 'yearly';

// Plan configuration mapped to Polar product IDs
// Monthly products
export const MONTHLY_PRODUCT_IDS: Record<string, string> = {
  hobby: process.env.POLAR_PRODUCT_HOBBY_MONTHLY || '',
  pro: process.env.POLAR_PRODUCT_PRO_MONTHLY || '',
  max: process.env.POLAR_PRODUCT_MAX_MONTHLY || '',
};

// Yearly products
export const YEARLY_PRODUCT_IDS: Record<string, string> = {
  hobby: process.env.POLAR_PRODUCT_HOBBY_YEARLY || '',
  pro: process.env.POLAR_PRODUCT_PRO_YEARLY || '',
  max: process.env.POLAR_PRODUCT_MAX_YEARLY || '',
};

// Get product ID based on plan and billing period
export function getProductId(planId: string, billingPeriod: BillingPeriod): string {
  if (billingPeriod === 'yearly') {
    return YEARLY_PRODUCT_IDS[planId] || '';
  }
  return MONTHLY_PRODUCT_IDS[planId] || '';
}

// Plan limits configuration
export const PLAN_LIMITS = {
  free: {
    eventsPerMonth: 25000,
    projects: 1,
    retentionDays: 7,
  },
  hobby: {
    eventsPerMonth: 500000,
    projects: 3,
    retentionDays: 60,
  },
  pro: {
    eventsPerMonth: 2500000,
    projects: 10,
    retentionDays: 180,
  },
  max: {
    eventsPerMonth: -1, // Unlimited
    projects: -1, // Unlimited
    retentionDays: 1095, // 3 years
  },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;

export function getPlanLimits(planId: string): typeof PLAN_LIMITS[PlanId] {
  return PLAN_LIMITS[planId as PlanId] || PLAN_LIMITS.free;
}

// Get customer state from Polar by external ID (our user ID)
export async function getCustomerState(externalId: string) {
  try {
    const state = await polar.customers.getStateExternal({
      externalId,
    });
    return state;
  } catch {
    return null;
  }
}

// Create or get customer in Polar
export async function ensureCustomer(userId: string, email: string, name?: string) {
  try {
    // Try to get existing customer by external ID
    const existingCustomer = await polar.customers.getExternal({
      externalId: userId,
    });

    if (existingCustomer) {
      return existingCustomer;
    }
  } catch {
    // Customer doesn't exist, will create one
  }

  try {
    // Create new customer
    const customer = await polar.customers.create({
      email,
      name: name || undefined,
      externalId: userId,
    });

    return customer;
  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
  }
}

// Create a checkout session for a plan upgrade
export async function createCheckoutSession(
  userId: string,
  email: string,
  planId: string,
  billingPeriod: BillingPeriod,
  successUrl: string,
) {
  const productId = getProductId(planId, billingPeriod);
  if (!productId) {
    throw new Error(`No product ID configured for plan: ${planId} (${billingPeriod})`);
  }

  // Ensure customer exists
  await ensureCustomer(userId, email);

  const checkout = await polar.checkouts.create({
    products: [productId],
    externalCustomerId: userId,
    successUrl,
    customerEmail: email,
  });

  return checkout;
}

// Get subscription details for a customer
export async function getCustomerSubscription(customerId: string) {
  try {
    const subscriptions = await polar.subscriptions.list({
      customerId,
      active: true,
    });

    if (subscriptions.result.items.length > 0) {
      return subscriptions.result.items[0];
    }

    return null;
  } catch {
    return null;
  }
}

// Determine plan from subscription product
export function getPlanFromProductId(productId: string): PlanId {
  // Check monthly products
  for (const [plan, id] of Object.entries(MONTHLY_PRODUCT_IDS)) {
    if (id === productId) {
      return plan as PlanId;
    }
  }
  // Check yearly products
  for (const [plan, id] of Object.entries(YEARLY_PRODUCT_IDS)) {
    if (id === productId) {
      return plan as PlanId;
    }
  }
  return 'free';
}

// Check if a product ID is yearly
export function isYearlyProduct(productId: string): boolean {
  return Object.values(YEARLY_PRODUCT_IDS).includes(productId);
}
