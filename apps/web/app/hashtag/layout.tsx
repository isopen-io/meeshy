import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FeedProviders } from '@/components/feed/FeedProviders';

/**
 * `/hashtag/[tag]` — découverte des posts et reels portant un hashtag.
 *
 * Server Component pour pouvoir exporter `metadata`. La page appelle
 * `useToast()` (signalement d'un post) : sans ce layout elle levait
 * `useToast must be used within a ToastProvider` et l'ErrorBoundary avalait
 * l'écran entier. Le stack de providers (thème V2 + toast + split-view +
 * AuthGuard) vit dans le client {@link FeedProviders}, partagé avec
 * `/feed`, `/feeds`, `/post`, `/mood`, `/reel` et `/story`.
 *
 * `robots: noindex` comme les routes sœurs : `GET /posts/hashtag/:tag` exige un
 * compte enregistré, un crawler n'obtiendrait donc jamais le contenu.
 */
export const metadata: Metadata = {
  title: 'Hashtag — Meeshy',
  robots: { index: false, follow: false },
};

export default function HashtagLayout({ children }: { children: ReactNode }) {
  return <FeedProviders>{children}</FeedProviders>;
}
