import { redirect } from 'next/navigation';

// `/feed` is a hub that currently resolves to the posts feed. The reels feed
// (`/feed/reels`) ships in a later phase.
export default function FeedIndexPage() {
  redirect('/feed/posts');
}
