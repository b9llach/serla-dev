import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { createCheckoutSession, getProductId, BillingPeriod } from '@/lib/polar/client';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get plan and billing period from form data or JSON body
    let plan: string | null = null;
    let billingPeriod: BillingPeriod = 'monthly';

    const contentType = request.headers.get('content-type');
    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      plan = formData.get('plan') as string;
      const period = formData.get('billingPeriod') as string;
      if (period === 'yearly') {
        billingPeriod = 'yearly';
      }
    } else {
      const body = await request.json();
      plan = body.plan;
      if (body.billingPeriod === 'yearly') {
        billingPeriod = 'yearly';
      }
    }

    if (!plan) {
      return NextResponse.json(
        { error: 'Plan is required' },
        { status: 400 }
      );
    }

    // Verify product exists for this plan/period combination
    const productId = getProductId(plan, billingPeriod);
    if (!productId) {
      return NextResponse.json(
        { error: `Invalid plan: ${plan} (${billingPeriod})` },
        { status: 400 }
      );
    }

    // Get user details
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/dashboard/settings/billing?success=true&plan=${plan}&period=${billingPeriod}`;

    const checkout = await createCheckoutSession(
      user.id,
      user.email,
      plan,
      billingPeriod,
      successUrl
    );

    // Redirect to Polar checkout
    return NextResponse.redirect(checkout.url, 303);
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
