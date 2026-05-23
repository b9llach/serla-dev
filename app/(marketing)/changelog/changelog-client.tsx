'use client';

import { motion } from 'framer-motion';

type Entry = {
  date: string;
  title: string;
  items: string[];
};

const ENTRIES: Entry[] = [
  {
    date: '2026-05-13',
    title: 'Teams: invite collaborators with role-based access',
    items: [
      'Project membership with three roles: owner, editor, viewer',
      'Invite by email with hashed-token acceptance links (7-day expiry)',
      'New /dashboard/settings/team page to manage members + pending invites + audit log',
      'Every mutating server action now gates on role - viewers are read-only, editors create/edit/delete content, owners manage members and project deletion',
      'Append-only audit log tracks invites, accepts, removals, role changes, project deletion',
    ],
  },
  {
    date: '2026-05-13',
    title: 'Active analytics: threshold alerts + weekly digest',
    items: [
      'New Alerts page - create threshold rules ("events drop below 100 in 24h") with email and/or webhook delivery',
      'Rules evaluated by the daily cron with per-alert cooldown so you do not get spammed when a threshold stays crossed',
      'Every fired alert is logged to alert_deliveries with delivery status + observed value for diagnostics',
      'Weekly digest emails sent Monday mornings with last-week totals, week-over-week change, and top events per project',
      'New Account settings toggle to opt out of the digest',
    ],
  },
  {
    date: '2026-05-13',
    title: 'SDK family: React, Node, Python, Go',
    items: [
      'serla-js-react: <SerlaProvider>, useTrack, useIdentify, useSuperProperties, <Track> declarative component',
      'serla-node: server-side SDK with class-based instance, auto-flush on process.beforeExit, Edge-runtime compatible',
      'serla: Python SDK with daemon flusher thread, context manager support, zero runtime deps (stdlib only)',
      'serla-go: zero-dep Go SDK with channel-based queue and context.Context support',
      'serla-js core: group analytics (Serla.group), exponential backoff on flush failures, X-Idempotency-Key per batch',
      'Heatmaps page launched: ranked clicked elements per page with optional screenshot overlay',
    ],
  },
  {
    date: '2026-05-13',
    title: 'Account self-service + webhook delivery log',
    items: [
      'New per-webhook delivery log with HTTP status, response body, and retry button',
      'Self-service password change and account deletion in Settings',
      'Date-range picker and segment filter on Funnels, Goals, Journeys, Attribution',
      'Auto-disabled webhooks now show a banner explaining the circuit breaker',
    ],
  },
  {
    date: '2026-05-12',
    title: 'Auth UX + dashboard cleanup',
    items: [
      'Show/hide password toggle and password strength meter on signup',
      '"Keep me signed in for 30 days" option on signin',
      'Removed confetti, recent events sidebar, and revenue auto-detection from the dashboard home',
      'Renamed Events nav to "Activity" and demoted it below insight features',
    ],
  },
  {
    date: '2026-05-12',
    title: 'serla-js v0.1.0',
    items: [
      'Official JavaScript SDK: ~7 KB minified, ESM + CJS + browser IIFE builds',
      'Auto-pageviews via History API, optional autoclick tracking',
      'Batched delivery with reliable sendBeacon flush on page unload',
      'TypeScript types included, optOut and data-serla-ignore privacy hooks',
    ],
  },
  {
    date: '2026-05-11',
    title: 'Security hardening',
    items: [
      'Webhook secrets now encrypted at rest with AES-256-GCM',
      'Polar payment webhook now idempotent and state-coordinated',
      'Cron jobs run with distributed locks - no double execution',
      'Soft-delete grace period for users and projects',
      'Atomic upserts for identify and session ingestion',
    ],
  },
];

function formatDate(iso: string) {
  // Parse as UTC to avoid timezone drift in rendered output.
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogClient() {
  const sorted = [...ENTRIES].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );

  return (
    <div className="bg-[#09090b] text-white">
      {/* Hero */}
      <section className="py-20 sm:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-zinc-500 mb-4 text-sm">Changelog</p>
            <h1 className="text-4xl md:text-5xl font-normal tracking-tight mb-6 text-zinc-100">
              What&apos;s new in Serla.
            </h1>
            <p className="text-zinc-400 max-w-xl leading-relaxed">
              Every shipped change, in plain language. Newest first.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Entries */}
      <section className="pb-20 sm:pb-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid gap-4">
            {sorted.map((entry, i) => (
              <motion.article
                key={`${entry.date}-${entry.title}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ delay: i * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 md:p-8"
              >
                <time
                  dateTime={entry.date}
                  className="text-zinc-500 text-xs uppercase tracking-widest"
                >
                  {formatDate(entry.date)}
                </time>
                <h2 className="text-xl md:text-2xl font-medium text-zinc-100 mt-2 mb-5">
                  {entry.title}
                </h2>
                <ul className="space-y-2.5">
                  {entry.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-zinc-400 text-sm leading-relaxed"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-600"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
