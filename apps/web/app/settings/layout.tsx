import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Paramètres - Meeshy',
  description: 'Personnalisez votre expérience Meeshy. Gérez vos préférences linguistiques, vos notifications et vos paramètres de confidentialité.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://meeshy.me/settings',
    siteName: 'Meeshy',
    title: 'Paramètres - Meeshy',
    description: 'Personnalisez votre expérience Meeshy. Gérez vos préférences linguistiques, vos notifications et vos paramètres de confidentialité.',
    images: [
      {
        url: 'https://meeshy.me/images/meeshy-og-settings.jpg',
        width: 1200,
        height: 630,
        alt: 'Paramètres Meeshy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Paramètres - Meeshy',
    description: 'Personnalisez votre expérience Meeshy.',
    images: ['https://meeshy.me/images/meeshy-og-settings.jpg'],
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: 'https://meeshy.me/settings',
  },
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
