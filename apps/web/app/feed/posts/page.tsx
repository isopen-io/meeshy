'use client';

// Canonical posts feed — an iOS-parity scrolling list of post / reel cards,
// preceded by the public story tray and the mood/status bar. Shares its
// implementation with the legacy `/feeds` alias via PostsFeedScreen.
import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

export default function FeedPostsPage() {
  return <PostsFeedScreen />;
}
