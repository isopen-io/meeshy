import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Redirection Meeshy',
  description: 'Vous êtes en cours de redirection...',
  robots: 'noindex, nofollow',
};

export default function TrackingRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
