import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Serla Privacy Policy - How we handle your data with privacy-first principles.',
};

export default function PrivacyPage() {
  return (
    <div className="bg-[#09090b] text-white min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-24 md:py-32">
        <p className="text-zinc-500 mb-4 text-sm">Legal</p>
        <h1 className="text-4xl md:text-5xl font-normal tracking-tight mb-6 text-zinc-100">
          Privacy Policy
        </h1>
        <p className="text-zinc-500 mb-12">Last updated: January 2025</p>

        <div className="prose prose-invert prose-zinc max-w-none">
          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">Overview</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              Serla is built with privacy at its core. We collect only the data necessary to provide
              our analytics service, and we never sell, share, or use your data for advertising purposes.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">What We Collect</h2>

            <h3 className="text-lg font-medium text-zinc-300 mb-3 mt-6">Account Information</h3>
            <p className="text-zinc-400 leading-relaxed mb-4">
              When you create an account, we collect your email address and password (securely hashed).
              This is used solely for authentication and account management.
            </p>

            <h3 className="text-lg font-medium text-zinc-300 mb-3 mt-6">Analytics Data</h3>
            <p className="text-zinc-400 leading-relaxed mb-4">
              For the analytics service, we process event data sent from your applications. This data
              belongs to you and is stored securely. We do not access or analyze your analytics data
              except as necessary to provide the service.
            </p>

            <h3 className="text-lg font-medium text-zinc-300 mb-3 mt-6">What We Do NOT Collect</h3>
            <ul className="text-zinc-400 space-y-2 list-disc list-inside">
              <li>We do not use cookies for tracking</li>
              <li>We do not use fingerprinting techniques</li>
              <li>We do not collect IP addresses for analytics (IPs are used only for geolocation, then discarded)</li>
              <li>We do not collect personal data from your end users unless you explicitly send it</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">How We Use Your Data</h2>
            <ul className="text-zinc-400 space-y-2 list-disc list-inside">
              <li>To provide and maintain the Serla analytics service</li>
              <li>To process payments and manage your subscription</li>
              <li>To send important service updates and security notices</li>
              <li>To respond to support requests</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">Data Storage and Security</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              Your data is stored on secure servers provided by Neon (PostgreSQL) and Vercel.
              All data is encrypted in transit (TLS) and at rest. We implement industry-standard
              security practices to protect your information.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">Data Retention</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              Analytics data is retained according to your subscription plan:
            </p>
            <ul className="text-zinc-400 space-y-2 list-disc list-inside">
              <li>Free: 7 days</li>
              <li>Hobby: 60 days</li>
              <li>Pro: 180 days</li>
              <li>Max: 3 years</li>
            </ul>
            <p className="text-zinc-400 leading-relaxed mt-4">
              After the retention period, data is automatically and permanently deleted.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">Third-Party Services</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              We use the following third-party services:
            </p>
            <ul className="text-zinc-400 space-y-2 list-disc list-inside">
              <li><strong className="text-zinc-300">Polar.sh</strong> - Payment processing</li>
              <li><strong className="text-zinc-300">Vercel</strong> - Hosting and infrastructure</li>
              <li><strong className="text-zinc-300">Neon</strong> - Database hosting</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">Your Rights</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="text-zinc-400 space-y-2 list-disc list-inside">
              <li>Access your personal data</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your analytics data</li>
              <li>Close your account at any time</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">GDPR Compliance</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              Serla is designed to be GDPR compliant. Our cookie-free, fingerprint-free approach
              means you typically do not need consent banners when using Serla for analytics on
              your websites.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-medium text-zinc-200 mb-4">Changes to This Policy</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              We may update this privacy policy from time to time. We will notify you of any
              significant changes via email or through the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-zinc-200 mb-4">Contact</h2>
            <p className="text-zinc-400 leading-relaxed">
              For privacy-related questions or requests, contact us at{' '}
              <a href="mailto:privacy@serla.dev" className="text-zinc-200 hover:text-white underline">
                privacy@serla.dev
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
