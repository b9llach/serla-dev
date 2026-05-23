import { Metadata } from 'next';
import VsPostHogClient from './vs-posthog-client';

export const metadata: Metadata = {
  title: 'Serla vs PostHog',
  description:
    'An honest comparison of Serla and PostHog. Smaller SDK, simpler pricing, and a sharply scoped feature set for developers who don’t need feature flags or session replay.',
};

export default function VsPostHogPage() {
  return <VsPostHogClient />;
}
