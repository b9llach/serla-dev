'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { canAccess, getRequiredPlan, PLAN_NAMES } from '@/lib/plans/features';

interface FeatureGateProps {
  feature: string;
  userPlan: string;
  requiredPlan: string;
  children: React.ReactNode;
}

// Re-export the helpers from the shared module so existing callers
// (sidebar, dashboards, etc.) keep working without import changes.
export { canAccess, getRequiredPlan };

export function FeatureGate({ feature, userPlan, requiredPlan, children }: FeatureGateProps) {
  const hasAccess = canAccess(feature, userPlan);

  if (hasAccess) {
    return <>{children}</>;
  }

  const planLabel = PLAN_NAMES[requiredPlan as keyof typeof PLAN_NAMES] || 'a paid plan';

  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
          <Lock className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="text-xl font-medium text-white mb-2">
          Upgrade to {planLabel}
        </h2>
        <p className="text-zinc-500 mb-6">
          This feature is available on the {planLabel} plan and above.
          Upgrade your plan to unlock this feature.
        </p>
        <Button
          className="bg-white text-black hover:bg-zinc-200 rounded-lg h-10 px-6"
          asChild
        >
          <Link href="/dashboard/settings/billing">
            View Plans
          </Link>
        </Button>
      </div>
    </div>
  );
}
