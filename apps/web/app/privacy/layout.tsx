import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Politique de confidentialité - Meeshy',
  description: 'Consultez notre politique de confidentialité. Découvrez comment Meeshy protège vos données personnelles et respecte votre vie privée.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://meeshy.me/privacy',
    siteName: 'Meeshy',
    title: 'Politique de confidentialité - Meeshy',
    description: 'Consultez notre politique de confidentialité. Découvrez comment Meeshy protège vos données personnelles et respecte votre vie privée.',
    images: [
      {
        url: 'https://meeshy.me/images/meeshy-og-default.jpg',
        width: 1200,
        height: 630,
        alt: 'Politique de confidentialité Meeshy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Politique de confidentialité - Meeshy',
    description: 'Consultez notre politique de confidentialité.',
    images: ['https://meeshy.me/images/meeshy-og-default.jpg'],
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: 'https://meeshy.me/privacy',
  },
};

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
