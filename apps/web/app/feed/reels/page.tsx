'use client';

// Canonical reels feed — a near-full-screen autoplaying vertical reel player
// driven by the personalised affinity thread. Scroll / arrows advance one reel
// at a time. Shares the ReelPlayer with the deep-linked `/reel/:id` route.
import { ReelsFeedScreen } from '@/components/feed/ReelsFeedScreen';

export default function FeedReelsPage() {
  return <ReelsFeedScreen />;
}
