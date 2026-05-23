import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Billing',
};
import { db, users, events, projects } from '@/lib/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Check, AlertTriangle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BillingPlans } from '@/components/dashboard/billing-plans';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    eventsPerMonth: 25000,
    projects: 1,
    retention: 7,
    features: ['25K events/month', '1 project', '7 day retention', 'Basic analytics'],
  },
  {
    id: 'hobby',
    name: 'Hobby',
    monthlyPrice: 9,
    eventsPerMonth: 500000,
    projects: 3,
    retention: 60,
    features: ['500K events/month', '3 projects', '60 day retention', 'All analytics features', 'Email support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 29,
    eventsPerMonth: 2500000,
    projects: 10,
    retention: 180,
    features: ['2.5M events/month', '10 projects', '180 day retention', 'Priority support', 'API access'],
  },
  {
    id: 'max',
    name: 'Max',
    monthlyPrice: 79,
    eventsPerMonth: -1,
    projects: -1,
    retention: 1095,
    features: ['Unlimited events', 'Unlimited projects', '3 year retention', 'Dedicated support', 'Custom integrations'],
  },
];

async function getBillingData(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const userProjects = await db.query.projects.findMany({
    where: eq(projects.userId, userId),
  });

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  let totalEvents = 0;
  for (const project of userProjects) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(
        and(
          eq(events.projectId, project.id),
          gte(events.timestamp, monthStart)
        )
      );
    totalEvents += Number(result[0]?.count || 0);
  }

  return {
    user,
    projectCount: userProjects.length,
    eventsThisMonth: totalEvents,
  };
}

interface PageProps {
  searchParams: Promise<{ success?: string; plan?: string }>;
}

export default async function BillingPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const { success, plan: upgradedPlan } = await searchParams;
  const { user, projectCount, eventsThisMonth } = await getBillingData(session.userId);

  if (!user) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Billing</h1>
          <p className="text-muted-foreground">User not found.</p>
        </div>
      </div>
    );
  }

  const currentPlan = PLANS.find(p => p.id === user.plan) || PLANS[0];
  const usagePercent = currentPlan.eventsPerMonth > 0
    ? Math.min((eventsThisMonth / currentPlan.eventsPerMonth) * 100, 100)
    : 0;

  const isNearLimit = usagePercent >= 80;
  const isOverLimit = usagePercent >= 100;
  const hasActiveSubscription = user.polarSubscriptionId !== null;

  const polarOrgSlug = process.env.POLAR_ORG_SLUG || '';
  const customerPortalUrl = `https://polar.sh/${polarOrgSlug}/portal`;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-muted-foreground">
            Manage your subscription and view usage
          </p>
        </div>

        {success === 'true' && (
          <Alert className="border-green-500/50 bg-green-500/10">
            <Check className="h-4 w-4 text-green-500" />
            <AlertTitle>Subscription Updated</AlertTitle>
            <AlertDescription>
              Your subscription has been updated to the {upgradedPlan ? (PLANS.find(p => p.id === upgradedPlan)?.name || 'new') : 'new'} plan.
              Changes may take a moment to reflect.
            </AlertDescription>
          </Alert>
        )}

        {isNearLimit && !isOverLimit && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertTitle>Approaching Event Limit</AlertTitle>
            <AlertDescription>
              You&apos;ve used {usagePercent.toFixed(0)}% of your monthly event quota.
              Consider upgrading to avoid service interruption.
            </AlertDescription>
          </Alert>
        )}

        {isOverLimit && (
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertTitle>Event Limit Reached</AlertTitle>
            <AlertDescription>
              You&apos;ve reached your monthly event limit. New events will be rejected until your limit resets or you upgrade your plan.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>Your active subscription</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {hasActiveSubscription && (
                  <Badge variant="outline" className="text-green-500 border-green-500">
                    Active
                  </Badge>
                )}
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  {currentPlan.name}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">Events this month</span>
                <span className="text-sm font-medium">
                  {eventsThisMonth.toLocaleString()} / {currentPlan.eventsPerMonth > 0 ? currentPlan.eventsPerMonth.toLocaleString() : 'Unlimited'}
                </span>
              </div>
              <Progress
                value={usagePercent}
                className={`h-2 ${isOverLimit ? '[&>div]:bg-red-500' : isNearLimit ? '[&>div]:bg-yellow-500' : ''}`}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 bg-[#0a0a0a] rounded-xl">
                <p className="text-sm text-muted-foreground">Projects</p>
                <p className="text-2xl font-bold">
                  {projectCount} / {currentPlan.projects > 0 ? currentPlan.projects : 'Unlimited'}
                </p>
              </div>
              <div className="p-4 bg-[#0a0a0a] rounded-xl">
                <p className="text-sm text-muted-foreground">Data Retention</p>
                <p className="text-2xl font-bold">{currentPlan.retention} days</p>
              </div>
            </div>
          </CardContent>
          {hasActiveSubscription && (
            <CardFooter>
              <Button variant="outline" asChild>
                <a href={customerPortalUrl} target="_blank" rel="noopener noreferrer">
                  Manage Subscription
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </CardFooter>
          )}
        </Card>

        <BillingPlans
          plans={PLANS}
          currentPlanId={currentPlan.id}
          hasActiveSubscription={hasActiveSubscription}
          customerPortalUrl={customerPortalUrl}
        />

        <Card>
          <CardHeader>
            <CardTitle>Billing Portal</CardTitle>
            <CardDescription>Manage your payment information and invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              All payment processing and subscription management is handled securely by Polar.sh.
              Access your customer portal to view invoices, update payment methods, and manage your subscription.
            </p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" asChild>
              <a href={customerPortalUrl} target="_blank" rel="noopener noreferrer">
                Open Customer Portal
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
