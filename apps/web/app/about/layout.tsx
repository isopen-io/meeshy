import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'À propos - Meeshy',
  description: 'Découvrez Meeshy, la plateforme de messagerie multilingue en temps réel. Notre mission: connecter le monde sans barrière linguistique.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://meeshy.me/about',
    siteName: 'Meeshy',
    title: 'À propos de Meeshy',
    description: 'Découvrez Meeshy, la plateforme de messagerie multilingue en temps réel. Notre mission: connecter le monde sans barrière linguistique.',
    images: [
      {
        url: 'https://meeshy.me/images/meeshy-og-default.jpg',
        width: 1200,
        height: 630,
        alt: 'À propos de Meeshy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'À propos de Meeshy',
    description: 'Découvrez Meeshy, la plateforme de messagerie multilingue en temps réel.',
    images: ['https://meeshy.me/images/meeshy-og-default.jpg'],
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: 'https://meeshy.me/about',
  },
};

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
