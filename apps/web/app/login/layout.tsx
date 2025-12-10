import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Connexion - Meeshy',
  description: 'Connectez-vous à votre compte Meeshy et accédez à vos conversations multilingues en temps réel.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://meeshy.me/login',
    siteName: 'Meeshy',
    title: 'Connexion - Meeshy',
    description: 'Connectez-vous à votre compte Meeshy et accédez à vos conversations multilingues en temps réel.',
    images: [
      {
        url: 'https://meeshy.me/images/meeshy-og-login.jpg',
        width: 1200,
        height: 630,
        alt: 'Connexion à Meeshy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Connexion - Meeshy',
    description: 'Connectez-vous à votre compte Meeshy et accédez à vos conversations multilingues en temps réel.',
    images: ['https://meeshy.me/images/meeshy-og-login.jpg'],
    creator: '@meeshy_app',
  },
  alternates: {
    canonical: 'https://meeshy.me/login',
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
