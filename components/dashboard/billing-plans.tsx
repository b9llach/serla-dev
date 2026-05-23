'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Zap } from 'lucide-react';
import { Serla } from 'serla-js';

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  eventsPerMonth: number;
  projects: number;
  retention: number;
  features: string[];
}

interface BillingPlansProps {
  plans: Plan[];
  currentPlanId: string;
  hasActiveSubscription: boolean;
  customerPortalUrl: string;
}

export function BillingPlans({ plans, currentPlanId, hasActiveSubscription, customerPortalUrl }: BillingPlansProps) {
  const [isYearly, setIsYearly] = useState(false);

  const getPrice = (monthlyPrice: number) => {
    if (monthlyPrice === 0) return '$0';
    if (isYearly) {
      const yearlyTotal = monthlyPrice * 10;
      const monthlyEquivalent = Math.round(yearlyTotal / 12);
      return `$${monthlyEquivalent}`;
    }
    return `$${monthlyPrice}`;
  };

  const getYearlyTotal = (monthlyPrice: number) => {
    if (monthlyPrice === 0) return null;
    return monthlyPrice * 10;
  };

  const getYearlySavings = (monthlyPrice: number) => {
    if (monthlyPrice === 0) return null;
    return monthlyPrice * 2;
  };

  const currentPlanIndex = plans.findIndex(p => p.id === currentPlanId);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Available Plans</h2>
        <div className="inline-flex items-center p-1 rounded-lg bg-zinc-900 border border-zinc-800">
          <button
            onClick={() => setIsYearly(false)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              !isYearly
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setIsYearly(true)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              isYearly
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, index) => {
          const isCurrentPlan = plan.id === currentPlanId;
          const isUpgrade = index > currentPlanIndex;
          const isFree = plan.id === 'free';

          return (
            <Card key={plan.id} className={isCurrentPlan ? 'ring-2 ring-blue-600' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrentPlan && (
                    <Badge>Current</Badge>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-bold">
                    {getPrice(plan.monthlyPrice)}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                {isYearly && plan.monthlyPrice > 0 && (
                  <div className="mt-1">
                    <p className="text-zinc-600 text-xs">
                      ${getYearlyTotal(plan.monthlyPrice)} billed yearly
                    </p>
                    <p className="text-green-500 text-xs">
                      Save ${getYearlySavings(plan.monthlyPrice)}/year
                    </p>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrentPlan ? (
                  <Button className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : isFree ? (
                  hasActiveSubscription ? (
                    <Button variant="outline" className="w-full" asChild>
                      <a href={customerPortalUrl} target="_blank" rel="noopener noreferrer">
                        Cancel Subscription
                      </a>
                    </Button>
                  ) : (
                    <Button className="w-full" disabled>
                      Free Plan
                    </Button>
                  )
                ) : (
                  <form
                    action="/api/checkout"
                    method="POST"
                    className="w-full"
                    onSubmit={() => {
                      Serla.track('plan_upgrade_initiated', {
                        plan: plan.id,
                        billingPeriod: isYearly ? 'yearly' : 'monthly',
                        previousPlan: currentPlanId,
                      });
                    }}
                  >
                    <input type="hidden" name="plan" value={plan.id} />
                    <input type="hidden" name="billingPeriod" value={isYearly ? 'yearly' : 'monthly'} />
                    <Button
                      type="submit"
                      className="w-full"
                      variant={isUpgrade ? 'default' : 'outline'}
                    >
                      {isUpgrade ? (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Upgrade
                        </>
                      ) : (
                        'Change Plan'
                      )}
                    </Button>
                  </form>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
