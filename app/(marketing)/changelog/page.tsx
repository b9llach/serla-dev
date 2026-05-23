import { Metadata } from 'next';
import ChangelogClient from './changelog-client';

export const metadata: Metadata = {
  title: 'Changelog',
  description: "What's new in Serla.",
};

export default function ChangelogPage() {
  return <ChangelogClient />;
}
