import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FeedProviders } from '@/components/feed/FeedProviders';

/**
 * Canonical feed surface (`/feed/posts`, and later `/feed/reels`).
 *
 * This layout is a Server Component so it can export `metadata` for SEO —
 * the actual provider stack lives in the client-side {@link FeedProviders},
 * shared with the legacy `/feeds` alias.
 */
export const metadata: Metadata = {
  title: 'Fil d’actualité — Meeshy',
  description:
    'Découvrez les publications, reels et stories de votre réseau Meeshy, traduits automatiquement dans votre langue.',
  openGraph: {
    title: 'Fil d’actualité — Meeshy',
    description:
      'Découvrez les publications, reels et stories de votre réseau Meeshy, traduits automatiquement dans votre langue.',
    type: 'website',
  },
  robots: { index: false, follow: false },
};

export default function FeedLayout({ children }: { children: ReactNode }) {
  return <FeedProviders>{children}</FeedProviders>;
}
