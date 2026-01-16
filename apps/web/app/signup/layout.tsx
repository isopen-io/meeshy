import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildOgMetadata } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'Inscription - Meeshy',
  description: 'Créez votre compte Meeshy et rejoignez la communauté mondiale de messagerie multilingue en temps réel.',
  openGraph: {
    ...buildOgMetadata('signin', {
      title: 'Inscription - Meeshy',
      description: 'Créez votre compte Meeshy et rejoignez la communauté mondiale de messagerie multilingue en temps réel.',
      url: '/signup',
    }),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Inscription - Meeshy',
    description: 'Créez votre compte Meeshy et rejoignez la communauté mondiale de messagerie multilingue en temps réel.',
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: '/signup',
  },
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
