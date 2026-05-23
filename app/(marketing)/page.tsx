'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
};

// Mini chart component with gradient coloring
function MiniChart({ data }: { data: number[] }) {
  const max = Math.max(...data);

  return (
    <div className="flex items-end gap-1 h-full">
      {data.map((value, i) => {
        const intensity = value / max;
        return (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${intensity * 100}%` }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className="flex-1 rounded-sm min-w-[8px]"
            style={{
              background: `linear-gradient(to top, #3b82f6, #60a5fa)`,
              opacity: 0.5 + intensity * 0.5,
            }}
          />
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const chartData = [12, 19, 14, 25, 22, 30, 28, 35, 32, 40, 38, 45];

  return (
    <div className="bg-[#09090b] text-white">
      {/* Hero Section */}
      <section className="relative min-h-[calc(100vh-56px)] flex items-center py-12 md:py-0 overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 w-full">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-20 items-center">
            {/* Left: Copy */}
            <motion.div
              initial="initial"
              animate="animate"
            >
              <motion.p
                variants={fadeIn}
                className="text-blue-400 mb-4 sm:mb-8 text-xs sm:text-sm font-medium tracking-widest uppercase"
              >
                Privacy-first analytics
              </motion.p>

              <motion.h1
                variants={fadeIn}
                transition={{ delay: 0.1 }}
                className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight leading-[1.1] sm:leading-[1.05] mb-4 sm:mb-8 text-white"
              >
                Track what matters.<br />
                <span className="text-zinc-500">Respect what&apos;s private.</span>
              </motion.h1>

              <motion.p
                variants={fadeIn}
                transition={{ delay: 0.2 }}
                className="text-base sm:text-xl text-zinc-400 max-w-lg mb-6 sm:mb-8 leading-relaxed"
              >
                Drop in 7 KB of JavaScript and get funnels, retention, goals, and revenue tracking. No cookies, no consent banners, no PostHog-sized bill &mdash; built for developers shipping product.
              </motion.p>

              <motion.div
                variants={fadeIn}
                transition={{ delay: 0.25 }}
                className="flex flex-wrap gap-2 mb-8 sm:mb-12"
              >
                {[
                  'See where users drop off',
                  'Track weekly retention cohorts',
                  'Measure revenue per source',
                  'Get a Slack alert when signups spike',
                ].map((useCase) => (
                  <span
                    key={useCase}
                    className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-xs text-zinc-400"
                  >
                    {useCase}
                  </span>
                ))}
              </motion.div>

              <motion.div
                variants={fadeIn}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4"
              >
                <Button
                  size="lg"
                  className="bg-white text-black hover:bg-zinc-100 rounded-full h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-medium w-full sm:w-auto"
                  asChild
                >
                  <Link href="/auth/signup">
                    Start tracking free
                    <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-full h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base w-full sm:w-auto"
                  asChild
                >
                  <Link href="/docs">
                    Read the docs
                  </Link>
                </Button>
              </motion.div>
            </motion.div>

            {/* Right: Code + Dashboard Preview - hidden on mobile */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="hidden lg:block space-y-6"
            >
              {/* Code snippet with syntax highlighting */}
              <div className="bg-[#18181b] rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-zinc-800/50">
                <div className="flex items-center gap-2 px-5 py-4 bg-[#0f0f11] border-b border-zinc-800/50">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                  <span className="ml-3 text-xs text-zinc-600">app.js</span>
                </div>
                <div className="p-6 font-mono text-base space-y-3">
                  <div className="text-zinc-600">{`// Initialize once`}</div>
                  <div>
                    <span className="text-[#c678dd]">const </span>
                    <span className="text-[#e06c75]">serla</span>
                    <span className="text-zinc-400"> = </span>
                    <span className="text-[#c678dd]">new </span>
                    <span className="text-[#e5c07b]">Serla</span>
                    <span className="text-zinc-400">(</span>
                    <span className="text-[#98c379]">&apos;sk_live_...&apos;</span>
                    <span className="text-zinc-400">)</span>
                  </div>
                  <div className="h-3" />
                  <div className="text-zinc-600">{`// Track anything`}</div>
                  <div>
                    <span className="text-[#e06c75]">serla</span>
                    <span className="text-zinc-400">.</span>
                    <span className="text-[#61afef]">track</span>
                    <span className="text-zinc-400">(</span>
                    <span className="text-[#98c379]">&apos;signup&apos;</span>
                    <span className="text-zinc-400">, {`{`}</span>
                  </div>
                  <div className="pl-6">
                    <span className="text-[#e06c75]">plan</span>
                    <span className="text-zinc-400">: </span>
                    <span className="text-[#98c379]">&apos;pro&apos;</span>
                    <span className="text-zinc-400">,</span>
                  </div>
                  <div className="pl-6">
                    <span className="text-[#e06c75]">source</span>
                    <span className="text-zinc-400">: </span>
                    <span className="text-[#98c379]">&apos;landing&apos;</span>
                  </div>
                  <div>
                    <span className="text-zinc-400">{`}`})</span>
                  </div>
                </div>
              </div>

              {/* Mini dashboard preview */}
              <div className="bg-[#18181b] rounded-2xl p-6 shadow-2xl shadow-black/50 border border-zinc-800/50">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-zinc-500 text-sm">Events today</span>
                  <span className="text-white text-2xl font-semibold">2,847</span>
                </div>
                <div className="h-16">
                  <MiniChart data={chartData} />
                </div>
                <div className="flex justify-between mt-4 text-sm text-zinc-600">
                  <span>12am</span>
                  <span className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    now
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features - Visual Cards */}
      <section className="py-32 border-t border-zinc-800/30">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-normal tracking-tight text-zinc-100">
              Built for developers
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Event Tracking Card - with live event feed */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="md:col-span-2 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6"
            >
              <h3 className="text-zinc-200 font-medium mb-1">Event tracking</h3>
              <p className="text-zinc-500 text-sm mb-6">One line. Any event.</p>
              <div className="bg-zinc-950 rounded-lg p-4 space-y-2.5 font-mono text-xs">
                {[
                  { event: 'signup', time: '2s ago', props: 'plan: pro', color: '#22c55e' },
                  { event: 'page_view', time: '5s ago', props: '/pricing', color: '#3b82f6' },
                  { event: 'button_click', time: '8s ago', props: 'cta_hero', color: '#f59e0b' },
                  { event: 'checkout', time: '12s ago', props: 'value: 29', color: '#8b5cf6' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3 text-zinc-400"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-zinc-300 w-24">{item.event}</span>
                    <span className="text-zinc-600 flex-1">{item.props}</span>
                    <span className="text-zinc-600">{item.time}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Real-time Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6"
            >
              <h3 className="text-zinc-200 font-medium mb-1">Real-time</h3>
              <p className="text-zinc-500 text-sm mb-6">Data in seconds, not hours.</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-4xl font-light text-zinc-100">147</span>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <span className="text-zinc-500 text-xs">live</span>
                  </div>
                </div>
                <div className="h-px bg-zinc-800" />
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Last event</span>
                  <span className="text-green-400">0.3s ago</span>
                </div>
              </div>
            </motion.div>

            {/* Funnels Card - with visual funnel */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6"
            >
              <h3 className="text-zinc-200 font-medium mb-1">Funnels</h3>
              <p className="text-zinc-500 text-sm mb-6">See where users drop off.</p>
              <div className="space-y-2">
                {[
                  { step: 'Visit', pct: 100, color: '#3b82f6' },
                  { step: 'Signup', pct: 68, color: '#8b5cf6' },
                  { step: 'Activate', pct: 45, color: '#f59e0b' },
                  { step: 'Convert', pct: 23, color: '#22c55e' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-16 text-xs text-zinc-500">{item.step}</div>
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${item.pct}%` }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1, duration: 0.5 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                    </div>
                    <div className="w-10 text-xs text-zinc-400 text-right">{item.pct}%</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Retention Card - with heatmap */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="md:col-span-2 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6"
            >
              <h3 className="text-zinc-200 font-medium mb-1">Retention</h3>
              <p className="text-zinc-500 text-sm mb-6">Cohort analysis that makes sense.</p>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
                {[100, 72, 58, 45, 38, 32, 28, 25,
                  100, 68, 52, 41, 35, 29, 24, 21,
                  100, 75, 61, 48, 40, 34, 30, 27,
                  100, 70, 55, 43, 36, 30, 26, 23].map((value, i) => {
                  // Interpolate from purple (high) to dark (low)
                  const intensity = value / 100;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.02 }}
                      className="aspect-square rounded"
                      style={{
                        backgroundColor: `rgba(139, 92, 246, ${intensity * 0.8})`,
                      }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-3 text-xs text-zinc-600">
                <span>Day 0</span>
                <span>Day 7</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it works - Simplified */}
      <section id="how" className="py-32 bg-zinc-900/30">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-normal tracking-tight text-zinc-100 mb-4">
              Start in 5 minutes
            </h2>
            <p className="text-zinc-500">No complex setup. No configuration files.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { num: '01', title: 'Add script', code: '<script src="serla.js">' },
              { num: '02', title: 'Initialize', code: "new Serla('sk_...')" },
              { num: '03', title: 'Track', code: "serla.track('event')" },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="text-center"
              >
                <div className="text-zinc-700 text-4xl font-light mb-4">{step.num}</div>
                <h3 className="text-zinc-200 font-medium mb-4">{step.title}</h3>
                <div className="bg-zinc-950 border border-zinc-800/50 rounded-lg px-4 py-3 font-mono text-sm text-zinc-400">
                  {step.code}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy - Visual comparison */}
      <section className="py-32 border-t border-zinc-800/30">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-normal tracking-tight text-zinc-100 mb-4">
              Privacy by design
            </h2>
            <p className="text-zinc-500">No cookies. No fingerprints. No consent banners.</p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { label: 'Cookie-free', icon: 'x' },
              { label: 'No IP tracking', icon: 'x' },
              { label: 'GDPR ready', icon: 'check' },
              { label: 'Your data', icon: 'check' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
                className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 text-center"
              >
                <div className={`w-10 h-10 mx-auto mb-3 rounded-full flex items-center justify-center ${
                  item.icon === 'check' ? 'bg-green-500/10' : 'bg-zinc-800'
                }`}>
                  {item.icon === 'check' ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <span className="text-zinc-300 text-sm font-medium">{item.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing - Simplified */}
      <section className="py-32 bg-zinc-900/30">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-normal tracking-tight text-zinc-100 mb-4">
              Simple pricing
            </h2>
            <p className="text-zinc-500">Start free. No credit card.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { name: 'Free', price: '$0', events: '25k events/mo', retention: '7 days', projects: '1 project', highlight: false },
              { name: 'Pro', price: '$29', events: '2.5M events/mo', retention: '180 days', projects: '10 projects', highlight: true },
              { name: 'Max', price: '$79', events: 'Unlimited', retention: '3 years', projects: 'Unlimited', highlight: false },
            ].map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className={`p-6 rounded-xl border text-center ${
                  plan.highlight
                    ? 'border-zinc-600 bg-zinc-900'
                    : 'border-zinc-800/50 bg-zinc-900/30'
                }`}
              >
                <h3 className="text-zinc-400 text-sm mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-3xl font-medium text-zinc-100">{plan.price}</span>
                  {plan.price !== '$0' && <span className="text-zinc-500 text-sm">/mo</span>}
                </div>
                <div className="space-y-1 mb-6 text-sm">
                  <p className="text-zinc-300">{plan.events}</p>
                  <p className="text-zinc-500">{plan.retention} retention</p>
                  <p className="text-zinc-500">{plan.projects}</p>
                </div>
                <Button
                  className={`w-full rounded-lg h-10 text-sm ${
                    plan.highlight
                      ? 'bg-zinc-100 text-zinc-900 hover:bg-white'
                      : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                  }`}
                  asChild
                >
                  <Link href="/auth/signup">Get started</Link>
                </Button>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-6"
          >
            <Link href="/pricing" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
              Compare plans
            </Link>
          </motion.p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 border-t border-zinc-800/30">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h2 className="text-3xl md:text-4xl font-normal tracking-tight mb-8 text-zinc-100">
              Start tracking today
            </h2>
            <div className="flex flex-wrap justify-center gap-4">
              <Button
                size="lg"
                className="bg-zinc-100 text-zinc-900 hover:bg-white rounded-full h-12 px-8 text-sm font-medium"
                asChild
              >
                <Link href="/auth/signup">
                  Create free account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
