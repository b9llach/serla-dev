import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { GlobalRealtimeNotifications } from "@/components/global-realtime";
import { SerlaProvider } from "@/components/serla-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://serla.dev';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Serla",
    template: "%s | Serla",
  },
  description: "Simple, privacy-focused analytics for developers.",
  keywords: ["analytics", "developer tools", "event tracking", "privacy", "funnels", "retention"],
  authors: [{ name: "Serla" }],
  creator: "Serla",
  publisher: "Serla",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Serla',
    title: 'Serla',
    description: 'Simple, privacy-focused analytics for developers.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Serla',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Serla',
    description: 'Simple, privacy-focused analytics for developers.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        <Toaster />
        <GlobalRealtimeNotifications />
        <SerlaProvider />
      </body>
    </html>
  );
}
