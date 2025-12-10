import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Conditions d\'utilisation - Meeshy',
  description: 'Consultez les conditions d\'utilisation de Meeshy. Découvrez les règles et responsabilités lors de l\'utilisation de notre plateforme de messagerie multilingue.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://meeshy.me/terms',
    siteName: 'Meeshy',
    title: 'Conditions d\'utilisation - Meeshy',
    description: 'Consultez les conditions d\'utilisation de Meeshy. Découvrez les règles et responsabilités lors de l\'utilisation de notre plateforme de messagerie multilingue.',
    images: [
      {
        url: 'https://meeshy.me/images/meeshy-og-default.jpg',
        width: 1200,
        height: 630,
        alt: 'Conditions d\'utilisation Meeshy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Conditions d\'utilisation - Meeshy',
    description: 'Consultez les conditions d\'utilisation de Meeshy.',
    images: ['https://meeshy.me/images/meeshy-og-default.jpg'],
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: 'https://meeshy.me/terms',
  },
};

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
