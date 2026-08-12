import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FeedProviders } from '@/components/feed/FeedProviders';

/**
 * `/story/[postId]` — immersive deep-linked story.
 *
 * Server Component so it can export `metadata`. Stories default to FRIENDS
 * visibility and are 24h-ephemeral, so these auth-gated deep links MUST stay
 * out of search indexes (a stale indexed snippet would outlive the story). The
 * provider stack (V2 theme + toast + split-view + AuthGuard) lives in the
 * client {@link FeedProviders}.
 */
export const metadata: Metadata = {
  title: 'Story — Meeshy',
  robots: { index: false, follow: false },
};

export default function StoryLayout({ children }: { children: ReactNode }) {
  return <FeedProviders>{children}</FeedProviders>;
}
