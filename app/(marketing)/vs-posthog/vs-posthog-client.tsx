'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

type Cell =
  | { kind: 'yes'; note?: string }
  | { kind: 'no'; note?: string }
  | { kind: 'text'; text: string };

type Row = {
  feature: string;
  serla: Cell;
  posthog: Cell;
};

const ROWS: Row[] = [
  {
    feature: 'Pricing',
    serla: { kind: 'text', text: 'Free 25K events. $9/mo Hobby.' },
    posthog: {
      kind: 'text',
      text: 'Free 1M events, then ~$0.000248/event. Hard cliff at the limit.',
    },
  },
  {
    feature: 'SDK size',
    serla: { kind: 'text', text: '~7 KB minified' },
    posthog: { kind: 'text', text: '~50 KB+ minified' },
  },
  {
    feature: 'Cookies / consent banners',
    serla: { kind: 'no', note: 'None required' },
    posthog: { kind: 'text', text: 'Optional (off by default)' },
  },
  {
    feature: 'Funnels, retention, goals',
    serla: { kind: 'yes' },
    posthog: { kind: 'yes' },
  },
  {
    feature: 'Feature flags',
    serla: { kind: 'yes' },
    posthog: { kind: 'yes' },
  },
  {
    feature: 'Session replay',
    serla: { kind: 'yes' },
    posthog: { kind: 'yes' },
  },
  {
    feature: 'A/B testing',
    serla: { kind: 'text', text: 'Via variant flags' },
    posthog: { kind: 'yes' },
  },
  {
    feature: 'Heatmaps',
    serla: { kind: 'yes' },
    posthog: { kind: 'yes' },
  },
  {
    feature: 'LLM observability',
    serla: { kind: 'yes' },
    posthog: { kind: 'no' },
  },
  {
    feature: 'Error tracking',
    serla: { kind: 'yes' },
    posthog: { kind: 'text', text: 'Beta' },
  },
  {
    feature: 'Self-hostable',
    serla: { kind: 'no', note: 'Not yet' },
    posthog: { kind: 'yes' },
  },
  {
    feature: 'Source available',
    serla: { kind: 'no' },
    posthog: { kind: 'text', text: 'Yes (MIT)' },
  },
  {
    feature: 'Hosted in EU',
    serla: { kind: 'no', note: 'US (Neon)' },
    posthog: { kind: 'text', text: 'EU cloud option' },
  },
];

function CellContent({ cell }: { cell: Cell }) {
  if (cell.kind === 'yes') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10">
          <Check className="h-3.5 w-3.5 text-green-500" />
        </span>
        <span className="text-zinc-300 text-sm">Yes</span>
        {cell.note && <span className="text-zinc-500 text-xs">{cell.note}</span>}
      </div>
    );
  }
  if (cell.kind === 'no') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800">
          <X className="h-3.5 w-3.5 text-zinc-500" />
        </span>
        <span className="text-zinc-500 text-sm">No</span>
        {cell.note && <span className="text-zinc-600 text-xs">{cell.note}</span>}
      </div>
    );
  }
  return <span className="text-zinc-300 text-sm">{cell.text}</span>;
}

export default function VsPostHogClient() {
  return (
    <div className="bg-[#09090b] text-white">
      {/* Hero */}
      <section className="py-20 sm:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial="initial"
            animate="animate"
            variants={staggerContainer}
          >
            <motion.p
              variants={fadeIn}
              className="text-zinc-500 mb-4 text-sm"
            >
              Comparison
            </motion.p>
            <motion.h1
              variants={fadeIn}
              className="text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight mb-6 text-zinc-100 leading-[1.1]"
            >
              Serla vs PostHog:
              <br />
              <span className="text-zinc-500">smaller, faster, opinionated.</span>
            </motion.h1>
            <motion.p
              variants={fadeIn}
              className="text-base sm:text-lg text-zinc-400 max-w-2xl leading-relaxed"
            >
              Both track events. Serla is for developers who don&apos;t want
              feature flags, session replay, and a 50 KB SDK they didn&apos;t ask
              for. PostHog does more &mdash; Serla does less, on purpose.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Comparison Table */}
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
              Feature by feature
            </h2>
            <p className="text-zinc-500">
              No marketing fluff &mdash; what each product actually ships today.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6 }}
            className="overflow-x-auto rounded-xl border border-zinc-800"
          >
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/40">
                  <th className="px-5 py-4 text-sm font-medium text-zinc-400 w-1/3">
                    Feature
                  </th>
                  <th className="px-5 py-4 text-sm font-medium text-zinc-100 w-1/3">
                    Serla
                  </th>
                  <th className="px-5 py-4 text-sm font-medium text-zinc-400 w-1/3">
                    PostHog
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={
                      i !== ROWS.length - 1
                        ? 'border-b border-zinc-800/60'
                        : ''
                    }
                  >
                    <td className="px-5 py-4 align-top text-sm text-zinc-300 font-medium">
                      {row.feature}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <CellContent cell={row.serla} />
                    </td>
                    <td className="px-5 py-4 align-top">
                      <CellContent cell={row.posthog} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* Choose Serla / Choose PostHog */}
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
              Which one is for you?
            </h2>
            <p className="text-zinc-500">
              We&apos;ll tell you when PostHog is the right call.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 md:p-8"
            >
              <p className="text-blue-400 text-xs font-medium tracking-widest uppercase mb-3">
                Choose Serla if
              </p>
              <h3 className="text-xl font-medium text-zinc-100 mb-6">
                You want product analytics, not a platform.
              </h3>
              <ul className="space-y-3">
                {[
                  'You ship as a solo founder or a small team.',
                  'You want funnels, retention, goals, and revenue — nothing else cluttering the UI.',
                  'You don’t need feature flags, session replay, or experiments.',
                  'You want a 7 KB SDK that won’t make Lighthouse cry.',
                  'You want a predictable bill that scales linearly, not exponentially.',
                  'You like opinionated products that say "no" so you don’t have to.',
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-3 text-sm text-zinc-300 leading-relaxed"
                  >
                    <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="rounded-2xl border border-zinc-800/50 bg-zinc-900/20 p-6 md:p-8"
            >
              <p className="text-zinc-400 text-xs font-medium tracking-widest uppercase mb-3">
                Choose PostHog if
              </p>
              <h3 className="text-xl font-medium text-zinc-100 mb-6">
                You want a full analytics platform.
              </h3>
              <ul className="space-y-3">
                {[
                  'You need feature flags and gradual rollouts in the same tool.',
                  'You want to watch session replays and pinpoint UX bugs.',
                  'You’re running A/B experiments and need an experimentation engine.',
                  'You want to self-host on your own infrastructure.',
                  'You have a team and time to manage a larger toolchain.',
                  'You’d rather have everything in one place than a tighter scope.',
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-3 text-sm text-zinc-400 leading-relaxed"
                  >
                    <Check className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-32 border-t border-zinc-800/30">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h2 className="text-3xl md:text-4xl font-normal tracking-tight mb-4 text-zinc-100">
              Still reading? Probably try Serla.
            </h2>
            <p className="text-zinc-500 mb-8 max-w-xl mx-auto">
              25,000 events a month, free forever. No credit card.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                className="bg-white text-black hover:bg-zinc-100 rounded-full h-12 px-8 text-sm font-medium"
                asChild
              >
                <Link href="/auth/signup">
                  Try Serla free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full h-12 px-8 text-sm"
                asChild
              >
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
