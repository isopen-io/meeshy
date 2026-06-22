import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FeedProviders } from '@/components/feed/FeedProviders';

/**
 * `/reel/[postId]` — immersive deep-linked reel.
 *
 * Server Component so it can export `metadata`: these are the share URLs minted
 * by the reel surfaces (`${origin}/reel/:id`) and the content is auth-gated and
 * may be FRIENDS/PRIVATE, so it MUST stay out of search indexes — same intent
 * as the `/feed/*` layout. The provider stack (V2 theme + toast + split-view +
 * AuthGuard) lives in the client {@link FeedProviders}, so `useToast()` /
 * `useSplitView()` still resolve inside the page.
 */
export const metadata: Metadata = {
  title: 'Reel — Meeshy',
  robots: { index: false, follow: false },
};

export default function ReelLayout({ children }: { children: ReactNode }) {
  return <FeedProviders>{children}</FeedProviders>;
}
