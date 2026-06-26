import { Metadata } from 'next';
import { ReactNode } from 'react';
import { logger } from '@/utils/logger';
import { buildApiUrl } from '@/lib/config';
import { getServerLocale } from '@/lib/i18n/server-locale';
import { composeMetadata, getMetadataPage, interpolate, pageString } from '@/lib/i18n/metadata';

interface UserProfileLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>; // Next.js 15: params est une Promise
}

export async function generateMetadata({ params }: UserProfileLayoutProps): Promise<Metadata> {
  const { id } = await params; // Next.js 15: params est une Promise
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';
  const locale = await getServerLocale();
  const meta = getMetadataPage(locale, 'userProfile');

  // Si c'est "me", rediriger vers le profil général
  if (id === 'me') {
    return composeMetadata({
      locale,
      title: pageString(meta, 'meTitle'),
      description: pageString(meta, 'meDescription'),
    });
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
        const displayName = user.displayName || fullName || user.username || pageString(meta, 'defaultDisplayName');
        const username = user.username || user.displayName || 'user';

        const title = interpolate(pageString(meta, 'title'), { name: displayName, username });
        const description = interpolate(pageString(meta, 'description'), { name: displayName });
        const imageAlt = interpolate(pageString(meta, 'ogImageAlt'), { name: displayName });

        // Construire l'URL de l'image dynamique
        const imageParams = new URLSearchParams({
          type: 'profile',
          title: displayName,
          subtitle: `@${username}`,
          userName: displayName,
        });

        const dynamicImageUrl = `${frontendUrl}/api/og-image-dynamic?${imageParams.toString()}`;

        return composeMetadata({
          locale,
          title,
          description,
          url: `${frontendUrl}/u/${id}`,
          image: dynamicImageUrl,
          imageAlt,
          type: 'profile',
          canonical: `${frontendUrl}/u/${id}`,
        });
      }
    }
  } catch (error) {
    // Silently fail if backend is not accessible during SSR (common in dev)
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      logger.warn('[UserProfileLayout]', 'Unable to fetch user profile, using fallback metadata', { data: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // Fallback metadata si l'appel API échoue
  return composeMetadata({
    locale,
    title: pageString(meta, 'fallbackTitle'),
    description: pageString(meta, 'fallbackDescription'),
    ogDescription: pageString(meta, 'fallbackOgDescription'),
    url: `${frontendUrl}/u/${id}`,
    image: `${frontendUrl}/og-image-meeshy.png`,
    imageAlt: pageString(meta, 'fallbackOgImageAlt'),
  });
}

export default function UserProfileLayout({ children }: UserProfileLayoutProps) {
  return <>{children}</>;
}
