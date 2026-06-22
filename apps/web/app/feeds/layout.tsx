'use client';

import { ReactNode } from 'react';
import { FeedProviders } from '@/components/feed/FeedProviders';

/**
 * Feeds Layout (legacy alias)
 *
 * The post feature is rendered with the Global Pulse design system, mounted at
 * the legacy `/feeds` + `/feeds/post/:postId` paths so external share URLs
 * minted by the gateway (`meeshy.me/feeds/post/...`) and the iOS universal-link
 * parser stay aligned with the web router. The provider stack is shared with
 * the canonical `/feed/*` routes via {@link FeedProviders}.
 */
export default function FeedsLayout({ children }: { children: ReactNode }) {
  return <FeedProviders>{children}</FeedProviders>;
}
