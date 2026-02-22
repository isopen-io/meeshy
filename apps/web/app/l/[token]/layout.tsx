import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '',
  description: '',
  robots: 'noindex, nofollow',
  openGraph: {
    title: '',
    description: '',
    images: [],
    siteName: '',
  },
  twitter: {
    title: '',
    description: '',
    images: [],
  },
};

export default function TrackingRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
