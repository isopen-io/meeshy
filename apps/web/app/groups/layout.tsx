import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Communautés - Meeshy',
  description: 'Découvrez et rejoignez des communautés multilingues du monde entier. Échangez avec des personnes partageant vos centres d\'intérêt dans leur langue maternelle.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://meeshy.me/groups',
    siteName: 'Meeshy',
    title: 'Communautés multilingues - Meeshy',
    description: 'Découvrez et rejoignez des communautés multilingues du monde entier. Échangez avec des personnes partageant vos centres d\'intérêt dans leur langue maternelle.',
    images: [
      {
        url: 'https://meeshy.me/images/meeshy-og-community.jpg',
        width: 1200,
        height: 630,
        alt: 'Communautés Meeshy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Communautés multilingues - Meeshy',
    description: 'Découvrez et rejoignez des communautés multilingues du monde entier.',
    images: ['https://meeshy.me/images/meeshy-og-community.jpg'],
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: 'https://meeshy.me/groups',
  },
};

export default function GroupsLayout({ children }: { children: ReactNode }) {
  return children;
}
