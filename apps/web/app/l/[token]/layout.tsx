import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: 'noindex, nofollow',
  openGraph: null,
  twitter: null,
};

export default function TrackingRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
