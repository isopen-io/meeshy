import { Metadata } from 'next';
import { ReactNode } from 'react';

export async function generateMetadata({ params }: { params: Promise<{ identifier: string }> }): Promise<Metadata> {
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me';
  const { identifier } = await params; // Next.js 15: params est une Promise

  // TODO: Récupérer les informations du groupe via une API pour personnaliser les meta tags
  // Pour l'instant, on utilise des meta tags génériques

  return {
    title: 'Groupe - Meeshy',
    description: 'Rejoignez ce groupe multilingue et échangez avec des membres du monde entier dans votre langue maternelle grâce à la traduction automatique.',
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      url: `${frontendUrl}/groups/${identifier}`,
      siteName: 'Meeshy',
      title: 'Groupe de discussion - Meeshy',
      description: 'Rejoignez ce groupe multilingue et échangez avec des membres du monde entier dans votre langue maternelle grâce à la traduction automatique.',
      images: [
        {
          url: `${frontendUrl}/images/meeshy-og-group.jpg`,
          width: 1200,
          height: 630,
          alt: 'Groupe Meeshy',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Groupe de discussion - Meeshy',
      description: 'Rejoignez ce groupe multilingue et échangez avec des membres du monde entier.',
      images: [`${frontendUrl}/images/meeshy-og-group.jpg`],
      creator: '@meeshy_app',
    },
    alternates: {
      canonical: `${frontendUrl}/groups/${identifier}`,
    },
  };
}

export default function GroupLayout({ children }: { children: ReactNode }) {
  return children;
}
