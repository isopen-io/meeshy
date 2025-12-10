import { Metadata } from 'next';
import { ReactNode } from 'react';

interface AffiliateLayoutProps {
  children: ReactNode;
  params: Promise<{ token: string }>; // Next.js 15: params est une Promise
}

export async function generateMetadata({ params }: AffiliateLayoutProps): Promise<Metadata> {
  const { token } = await params; // Next.js 15: params est une Promise
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';

  // Pour les pages d'affiliation, utiliser des métadonnées génériques attractives
  const title = 'Rejoignez Meeshy - Messagerie Multilingue';
  const description = 'Découvrez Meeshy, la plateforme de messagerie qui brise les barrières linguistiques. Communiquez en temps réel avec des personnes du monde entier, chacune dans sa langue préférée.';

  // Construire l'URL de l'image dynamique
  const imageParams = new URLSearchParams({
    type: 'affiliate',
    title: 'Rejoignez Meeshy',
    subtitle: 'Messagerie multilingue en temps réel',
    userName: '100+ langues supportées'
  });

  const dynamicImageUrl = `${frontendUrl}/api/og-image-dynamic?${imageParams.toString()}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${frontendUrl}/signin/affiliate/${token}`,
      siteName: 'Meeshy',
      images: [
        {
          url: dynamicImageUrl,
          width: 1200,
          height: 630,
          alt: 'Meeshy - Messagerie Multilingue',
        },
      ],
      locale: 'fr_FR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [dynamicImageUrl],
      creator: '@meeshy_app',
    },
    alternates: {
      canonical: `${frontendUrl}/signin/affiliate/${token}`,
    },
    keywords: [
      'messagerie multilingue',
      'traduction en temps réel',
      'communication internationale',
      'chat multilingue',
      'Meeshy',
      'application de messagerie',
      'plateforme de discussion',
    ],
  };
}

export default function AffiliateLayout({ children }: AffiliateLayoutProps) {
  return <>{children}</>;
}
