import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Serla Terms of Service - Rules and guidelines for using our analytics platform.',
};

export default function TermsPage() {
  return (
    <div className="bg-[#09090b] text-white min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-24 md:py-32">
        <p className="text-zinc-500 mb-4 text-sm">Legal</p>
        <h1 className="text-4xl md:text-5xl font-normal tracking-tight mb-6 text-zinc-100">
          Terms of Service
        </h1>
        <p className="text-zinc-500 mb-12">Last updated: January 2025</p>

        <div className="prose prose-invert prose-zinc max-w-none">
          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">1. Acceptance of Terms</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              By accessing or using Serla, you agree to be bound by these Terms of Service. If you
              do not agree to these terms, do not use the service.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">2. Description of Service</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              Serla provides a privacy-focused analytics platform for developers. The service includes
              event tracking, funnel analysis, retention metrics, and related analytics features.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">3. Account Registration</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              To use Serla, you must create an account with accurate information. You are responsible
              for maintaining the security of your account credentials and for all activities that
              occur under your account.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">4. Acceptable Use</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">You agree not to:</p>
            <ul className="text-zinc-400 space-y-2 list-disc list-inside">
              <li>Use the service for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to the service or its systems</li>
              <li>Interfere with or disrupt the service or servers</li>
              <li>Transmit malicious code or harmful data</li>
              <li>Exceed your plan&apos;s event limits through artificial means</li>
              <li>Resell or redistribute the service without authorization</li>
              <li>Use the service to collect data in violation of privacy laws</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">5. Your Data</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              You retain ownership of all data you send to Serla. We do not claim any ownership
              rights over your analytics data. You are responsible for ensuring you have the
              right to collect and process the data you send to Serla.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">6. API Usage</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              API keys are provided for your use only. Do not share API keys or embed them in
              public client-side code. You are responsible for any usage of your API keys.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">7. Payment and Billing</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              Paid plans are billed monthly or annually in advance. Prices are subject to change
              with 30 days notice. Refunds are provided at our discretion. You may cancel your
              subscription at any time, and it will remain active until the end of the billing period.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">8. Service Availability</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              We strive for high availability but do not guarantee uninterrupted service. We may
              perform maintenance that temporarily affects availability. We are not liable for
              any damages resulting from service interruptions.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">9. Limitation of Liability</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              Serla is provided &quot;as is&quot; without warranties of any kind. We are not liable for any
              indirect, incidental, special, or consequential damages. Our total liability is
              limited to the amount you paid for the service in the past 12 months.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">10. Termination</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              We may terminate or suspend your account for violations of these terms. You may
              close your account at any time. Upon termination, your data will be deleted
              according to our data retention policies.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">11. Changes to Terms</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              We may update these terms from time to time. Continued use of the service after
              changes constitutes acceptance of the new terms. We will notify you of significant
              changes via email.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">12. Governing Law</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              These terms are governed by applicable law. Any disputes will be resolved through
              binding arbitration.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-zinc-200 mb-4">Contact</h2>
            <p className="text-zinc-400 leading-relaxed">
              For questions about these terms, contact us at{' '}
              <a href="mailto:legal@serla.dev" className="text-zinc-200 hover:text-white underline">
                legal@serla.dev
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
