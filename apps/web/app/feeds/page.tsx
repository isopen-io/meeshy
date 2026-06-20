'use client';

// Legacy alias for the canonical `/feed/posts` route. Renders the shared
// PostsFeedScreen so `/feeds` and `/feed/posts` stay byte-for-byte identical.
import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

export default function FeedsPage() {
  return <PostsFeedScreen />;
}
