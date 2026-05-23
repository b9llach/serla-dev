'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import Script from 'next/script';
import { Check } from 'lucide-react';

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Serla Pricing',
  description: 'Simple pricing for developer analytics. Start free, pay when you grow.',
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: [
      {
        '@type': 'Product',
        name: 'Serla Free',
        description: 'For side projects - 25,000 events/mo, 1 project, 7 day retention',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'Product',
        name: 'Serla Hobby',
        description: 'For growing projects - 500,000 events/mo, 3 projects, 60 day retention',
        offers: {
          '@type': 'Offer',
          price: '9',
          priceCurrency: 'USD',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '9',
            priceCurrency: 'USD',
            billingDuration: 'P1M',
          },
        },
      },
      {
        '@type': 'Product',
        name: 'Serla Pro',
        description: 'For products - 2.5M events/mo, 10 projects, 180 day retention',
        offers: {
          '@type': 'Offer',
          price: '29',
          priceCurrency: 'USD',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '29',
            priceCurrency: 'USD',
            billingDuration: 'P1M',
          },
        },
      },
      {
        '@type': 'Product',
        name: 'Serla Max',
        description: 'For serious traffic - Unlimited events, unlimited projects, 3 year retention',
        offers: {
          '@type': 'Offer',
          price: '79',
          priceCurrency: 'USD',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '79',
            priceCurrency: 'USD',
            billingDuration: 'P1M',
          },
        },
      },
    ],
  },
};

const plans = [
  {
    id: 'free',
    name: 'Free',
    description: 'For side projects',
    monthlyPrice: 0,
    period: 'forever',
    events: '25,000 events/mo',
    features: [
      '1 project',
      '7 day retention',
      'Real-time dashboard',
      'Event tracking + sessions',
      'Community support',
    ],
  },
  {
    id: 'hobby',
    name: 'Hobby',
    description: 'Everything, for one cup of coffee',
    monthlyPrice: 9,
    period: '/month',
    events: '500,000 events/mo',
    features: [
      '3 projects',
      '60 day retention',
      'Session replay',
      'Feature flags',
      'LLM observability',
      'Error tracking',
      'Funnels, retention, journeys',
      'Heatmaps, segments, attribution',
      'Goals, custom metrics, alerts',
      'Webhooks + team collaboration',
      'Email support',
    ],
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'When Hobby starts to feel tight',
    monthlyPrice: 29,
    period: '/month',
    events: '2.5M events/mo',
    features: [
      '10 projects',
      '180 day retention',
      'Everything in Hobby',
      'Data export',
      'Priority support',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    description: 'For serious traffic',
    monthlyPrice: 79,
    period: '/month',
    events: 'Unlimited',
    features: [
      'Unlimited projects',
      '3 year retention',
      'Everything in Pro',
      'Custom integrations',
      'Dedicated support',
    ],
  },
];

const faqs = [
  {
    q: 'What counts as an event?',
    a: 'Any data point you send to Serla. Page views, clicks, form submissions, custom events. Auto-captured events count toward your limit too.',
  },
  {
    q: 'Can I change plans?',
    a: 'Yes. Upgrade or downgrade anytime. Changes are prorated.',
  },
  {
    q: 'What happens at my limit?',
    a: 'We notify you at 80%. At 100%, new events stop recording. Your existing data stays accessible. Upgrade to continue.',
  },
  {
    q: 'Annual billing?',
    a: 'Yes. Annual plans get 2 months free (pay for 10 months, get 12).',
  },
  {
    q: 'Free trial?',
    a: 'The Free plan is your trial. Use it as long as you want.',
  },
];

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);

  const getPrice = (monthlyPrice: number) => {
    if (monthlyPrice === 0) return '$0';
    if (isYearly) {
      // 2 months free = pay for 10 months
      const yearlyTotal = monthlyPrice * 10;
      const monthlyEquivalent = Math.round(yearlyTotal / 12);
      return `$${monthlyEquivalent}`;
    }
    return `$${monthlyPrice}`;
  };

  const getPeriod = (monthlyPrice: number, originalPeriod: string) => {
    if (monthlyPrice === 0) return originalPeriod;
    return isYearly ? '/month' : '/month';
  };

  const getYearlyTotal = (monthlyPrice: number) => {
    if (monthlyPrice === 0) return null;
    return monthlyPrice * 10;
  };

  const getYearlySavings = (monthlyPrice: number) => {
    if (monthlyPrice === 0) return null;
    // Savings = 12 months - 10 months = 2 months worth
    return monthlyPrice * 2;
  };

  return (
    <div className="bg-[#09090b] text-white">
      <Script
        id="pricing-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      {/* Hero */}
      <section className="py-24 md:py-32">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-zinc-500 mb-4 text-sm">Pricing</p>
            <h1 className="text-4xl md:text-5xl font-normal tracking-tight mb-6 text-zinc-100">
              Simple pricing
            </h1>
            <p className="text-zinc-400 max-w-lg leading-relaxed">
              Start free. Pay when you grow. No surprises.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Billing Toggle */}
      <section className="pb-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-center">
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
        </div>
      </section>

      {/* Plans */}
      <section className="pb-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className={`p-6 rounded-xl border ${
                  plan.highlight
                    ? 'border-zinc-700 bg-zinc-900/50'
                    : 'border-zinc-800/50 bg-zinc-900/20'
                }`}
              >
                <div className="mb-6">
                  <h3 className="text-zinc-200 font-medium">{plan.name}</h3>
                  <p className="text-zinc-500 text-sm">{plan.description}</p>
                </div>

                <div className="mb-1">
                  <span className="text-3xl font-medium text-zinc-100">
                    {getPrice(plan.monthlyPrice)}
                  </span>
                  <span className="text-zinc-500 text-sm">
                    {getPeriod(plan.monthlyPrice, plan.period)}
                  </span>
                </div>
                {isYearly && plan.monthlyPrice > 0 && (
                  <div className="mb-2">
                    <p className="text-zinc-600 text-xs">
                      ${getYearlyTotal(plan.monthlyPrice)} billed yearly
                    </p>
                    <p className="text-green-500 text-xs">
                      Save ${getYearlySavings(plan.monthlyPrice)}/year
                    </p>
                  </div>
                )}
                <p className="text-zinc-400 text-sm mb-6">{plan.events}</p>

                <ul className="space-y-2 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="text-zinc-500 text-sm">{f}</li>
                  ))}
                </ul>

                <Button
                  className={`w-full rounded-lg h-10 text-sm ${
                    plan.highlight
                      ? 'bg-zinc-100 text-zinc-900 hover:bg-white'
                      : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                  }`}
                  asChild
                >
                  <Link href={
                    plan.id === 'free'
                      ? '/auth/signup'
                      : `/auth/signup?plan=${plan.id}&period=${isYearly ? 'yearly' : 'monthly'}`
                  }>
                    Get started
                  </Link>
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Compare plans */}
      <section className="py-20 sm:py-32 border-t border-zinc-800/30">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <h2 className="text-2xl md:text-3xl font-normal tracking-tight text-zinc-100 mb-3">
              Compare plans
            </h2>
            <p className="text-zinc-500">
              Every feature, every plan. No fine print.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6 }}
            className="overflow-x-auto rounded-xl border border-zinc-800"
          >
            <ComparisonMatrix />
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-32 border-t border-zinc-800/30">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <h2 className="text-2xl font-normal text-zinc-100">Questions</h2>
          </motion.div>

          <div className="space-y-8">
            {faqs.map((faq, i) => (
              <motion.div
                key={faq.q}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
              >
                <h3 className="text-zinc-200 font-medium mb-2">{faq.q}</h3>
                <p className="text-zinc-500 leading-relaxed">{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-zinc-800/30">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-2xl font-normal text-zinc-100 mb-4">
              Questions?
            </h2>
            <p className="text-zinc-500 mb-6">
              We&apos;re here to help.
            </p>
            <Button
              variant="ghost"
              className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-lg h-10 px-4 text-sm"
              asChild
            >
              <Link href="mailto:hello@serla.dev">
                Get in touch
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

type MatrixCell = string | boolean;

type MatrixRow = {
  label: string;
  free: MatrixCell;
  hobby: MatrixCell;
  pro: MatrixCell;
  max: MatrixCell;
};

const MATRIX_ROWS: MatrixRow[] = [
  { label: 'Events per month', free: '25,000', hobby: '500,000', pro: '2,500,000', max: 'Unlimited' },
  { label: 'Projects', free: '1', hobby: '3', pro: '10', max: 'Unlimited' },
  { label: 'Data retention', free: '7 days', hobby: '60 days', pro: '180 days', max: '3 years' },
  { label: 'Real-time dashboard', free: true, hobby: true, pro: true, max: true },
  { label: 'Funnels', free: false, hobby: true, pro: true, max: true },
  { label: 'Retention cohorts', free: false, hobby: true, pro: true, max: true },
  { label: 'Journeys', free: false, hobby: true, pro: true, max: true },
  { label: 'Heatmaps', free: false, hobby: true, pro: true, max: true },
  { label: 'Attribution', free: false, hobby: true, pro: true, max: true },
  { label: 'Goals', free: false, hobby: true, pro: true, max: true },
  { label: 'Segments', free: false, hobby: true, pro: true, max: true },
  { label: 'Custom metrics', free: false, hobby: true, pro: true, max: true },
  { label: 'Alerts + weekly digest', free: false, hobby: true, pro: true, max: true },
  { label: 'Webhooks', free: false, hobby: true, pro: true, max: true },
  { label: 'Session replay', free: false, hobby: true, pro: true, max: true },
  { label: 'Feature flags', free: false, hobby: true, pro: true, max: true },
  { label: 'LLM observability', free: false, hobby: true, pro: true, max: true },
  { label: 'Error tracking', free: false, hobby: true, pro: true, max: true },
  { label: 'Team collaboration + roles', free: true, hobby: true, pro: true, max: true },
  { label: 'Data export', free: false, hobby: false, pro: true, max: true },
  { label: 'Email support', free: false, hobby: true, pro: true, max: true },
  { label: 'Priority support', free: false, hobby: false, pro: true, max: true },
  { label: 'Dedicated support', free: false, hobby: false, pro: false, max: true },
];

function MatrixCellContent({ value }: { value: MatrixCell }) {
  if (value === true) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10">
        <Check className="h-3.5 w-3.5 text-green-500" />
      </span>
    );
  }
  if (value === false) {
    return <span className="text-zinc-600" aria-label="Not included">&mdash;</span>;
  }
  return <span className="text-zinc-300 text-sm">{value}</span>;
}

function ComparisonMatrix() {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-zinc-800 bg-zinc-900/40">
          <th className="px-5 py-4 text-sm font-medium text-zinc-400 w-2/6">
            Feature
          </th>
          <th className="px-5 py-4 text-sm font-medium text-zinc-400 w-1/6">
            Free
          </th>
          <th className="px-5 py-4 text-sm font-medium text-zinc-400 w-1/6">
            Hobby
          </th>
          <th className="px-5 py-4 text-sm font-medium text-zinc-100 w-1/6">
            Pro
          </th>
          <th className="px-5 py-4 text-sm font-medium text-zinc-400 w-1/6">
            Max
          </th>
        </tr>
      </thead>
      <tbody>
        {MATRIX_ROWS.map((row, i) => (
          <tr
            key={row.label}
            className={
              i !== MATRIX_ROWS.length - 1 ? 'border-b border-zinc-800/60' : ''
            }
          >
            <td className="px-5 py-3.5 text-sm text-zinc-300 font-medium">
              {row.label}
            </td>
            <td className="px-5 py-3.5">
              <MatrixCellContent value={row.free} />
            </td>
            <td className="px-5 py-3.5">
              <MatrixCellContent value={row.hobby} />
            </td>
            <td className="px-5 py-3.5">
              <MatrixCellContent value={row.pro} />
            </td>
            <td className="px-5 py-3.5">
              <MatrixCellContent value={row.max} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
