import { Metadata } from 'next';
import { ReactNode } from 'react';
import { buildApiUrl } from '@/lib/config';

interface UserProfileLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>; // Next.js 15: params est une Promise
}

export async function generateMetadata({ params }: UserProfileLayoutProps): Promise<Metadata> {
  const { id } = await params; // Next.js 15: params est une Promise
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';

  // Si c'est "me", rediriger vers le profil général
  if (id === 'me') {
    return {
      title: 'Mon profil - Meeshy',
      description: 'Gérez votre profil sur Meeshy',
    };
  }

  try {
    // Récupérer les informations du profil utilisateur
    // Note: Use a timeout to prevent hanging during SSR
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(buildApiUrl(`/users/profile/${id}`), {
      next: { revalidate: 300 }, // Cache 5 minutes
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    }).finally(() => clearTimeout(timeoutId));

    if (response.ok) {
      const result = await response.json();

      if (result.success && result.data) {
        const user = result.data;

        // Construire le nom d'affichage
        const firstName = user.firstName || '';
        const lastName = user.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const displayName = user.displayName || fullName || user.username || 'Utilisateur';

        const username = user.username || user.displayName || 'user';

        const title = `${displayName} (@${username}) - Meeshy`;
        const description = `Profil de ${displayName} sur Meeshy. Découvrez les conversations et l'activité de cet utilisateur.`;

        // Construire l'URL de l'image dynamique
        const imageParams = new URLSearchParams({
          type: 'profile',
          title: displayName,
          subtitle: `@${username}`,
          userName: displayName
        });

        const dynamicImageUrl = `${frontendUrl}/api/og-image-dynamic?${imageParams.toString()}`;

        return {
          title,
          description,
          openGraph: {
            title,
            description,
            url: `${frontendUrl}/u/${id}`,
            siteName: 'Meeshy',
            images: [
              {
                url: dynamicImageUrl,
                width: 1200,
                height: 630,
                alt: `Profil de ${displayName}`,
              },
            ],
            locale: 'fr_FR',
            type: 'profile',
          },
          twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [dynamicImageUrl],
            creator: '@meeshy_app',
          },
          alternates: {
            canonical: `${frontendUrl}/u/${id}`,
          },
        };
      }
    }
  } catch (error) {
    // Silently fail if backend is not accessible during SSR (common in dev)
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Metadata] Unable to fetch user profile, using fallback metadata:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Fallback metadata si l'appel API échoue
  return {
    title: 'Profil utilisateur - Meeshy',
    description: 'Découvrez le profil de cet utilisateur sur Meeshy, la plateforme de messagerie multilingue en temps réel.',
    openGraph: {
      title: 'Profil utilisateur - Meeshy',
      description: 'Découvrez les profils et connectez-vous avec des utilisateurs du monde entier sur Meeshy.',
      url: `${frontendUrl}/u/${id}`,
      siteName: 'Meeshy',
      images: [
        {
          url: `${frontendUrl}/og-image-meeshy.png`,
          width: 1200,
          height: 630,
          alt: 'Meeshy - Messagerie multilingue',
        },
      ],
      locale: 'fr_FR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Profil utilisateur - Meeshy',
      description: 'Découvrez les profils et connectez-vous avec des utilisateurs du monde entier sur Meeshy.',
      images: [`${frontendUrl}/og-image-meeshy.png`],
      creator: '@meeshy_app',
    },
  };
}

export default function UserProfileLayout({ children }: UserProfileLayoutProps) {
  return <>{children}</>;
}
