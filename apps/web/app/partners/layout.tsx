import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Partenaires - Meeshy',
  description: 'Rejoignez le programme partenaire Meeshy. Développez votre réseau et bénéficiez d\'avantages exclusifs en devenant ambassadeur de la messagerie multilingue.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://meeshy.me/partners',
    siteName: 'Meeshy',
    title: 'Programme partenaire - Meeshy',
    description: 'Rejoignez le programme partenaire Meeshy. Développez votre réseau et bénéficiez d\'avantages exclusifs en devenant ambassadeur de la messagerie multilingue.',
    images: [
      {
        url: 'https://meeshy.me/images/meeshy-og-affiliate.jpg',
        width: 1200,
        height: 630,
        alt: 'Programme partenaire Meeshy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Programme partenaire - Meeshy',
    description: 'Rejoignez le programme partenaire Meeshy.',
    images: ['https://meeshy.me/images/meeshy-og-affiliate.jpg'],
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: 'https://meeshy.me/partners',
  },
};

export default function PartnersLayout({ children }: { children: ReactNode }) {
  return children;
}
