import { Metadata } from 'next';
import { ReactNode } from 'react';
import { logger } from '@/utils/logger';
import { getServerLocale } from '@/lib/i18n/server-locale';
import { composeMetadata, getMetadataPage, interpolate, pageMap, pageString } from '@/lib/i18n/metadata';
import type { InterfaceLocale } from '@/lib/i18n/locale-config';

interface JoinLayoutProps {
  children: ReactNode;
  params: Promise<{ linkId: string }>; // Next.js 15: params est une Promise
}

function buildFallbackMetadata(locale: InterfaceLocale, frontendUrl: string): Metadata {
  const meta = getMetadataPage(locale, 'join');
  return composeMetadata({
    locale,
    title: pageString(meta, 'fallbackTitle'),
    description: pageString(meta, 'fallbackDescription'),
    ogDescription: pageString(meta, 'fallbackOgDescription'),
    url: `${frontendUrl}/join`,
    image: `${frontendUrl}/og-image-meeshy.png`,
    imageAlt: pageString(meta, 'fallbackOgImageAlt'),
  });
}

export async function generateMetadata({ params }: JoinLayoutProps): Promise<Metadata> {
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';
  const locale = await getServerLocale();
  const meta = getMetadataPage(locale, 'join');

  try {
    const { linkId } = await params;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    // Récupérer les informations du lien d'invitation
    const response = await fetch(`${backendUrl}/anonymous/link/${linkId}`, {
      next: { revalidate: 300 }, // Cache 5 minutes
      cache: 'no-store' // Éviter les problèmes de cache pendant le développement
    }).catch(err => {
      console.error('[generateMetadata] Fetch error:', err);
      return null;
    });

    if (response && response.ok) {
      const result = await response.json();

      if (result.success && result.data) {
        const link = result.data;
        const conversation = link.conversation;
        const types = pageMap(meta, 'types');

        const conversationType = types[conversation?.type as string] || types.default;
        const conversationTitle = conversation?.title || pageString(meta, 'untitled');
        const creatorName = link.creator
          ? (link.creator.displayName || `${link.creator.firstName || ''} ${link.creator.lastName || ''}`.trim() || link.creator.username)
          : pageString(meta, 'someone');

        const title = interpolate(pageString(meta, 'title'), { title: conversationTitle });
        const description = link.description
          ? interpolate(pageString(meta, 'descriptionWithDescription'), { description: link.description, creator: creatorName })
          : interpolate(pageString(meta, 'descriptionDefault'), { creator: creatorName, title: conversationTitle });
        const imageAlt = interpolate(pageString(meta, 'ogImageAlt'), { title: conversationTitle });

        const participantsCount = link.stats?.totalParticipants || 0;
        const participantsLabel = interpolate(pageString(meta, 'participants'), { count: participantsCount });

        // Construire l'URL de l'image dynamique
        const imageParams = new URLSearchParams({
          type: 'invitation',
          title: conversationTitle,
          subtitle: `${conversationType} • ${participantsLabel}`,
          userName: creatorName,
          message: link.description || pageString(meta, 'imageMessage')
        });

        const dynamicImageUrl = `${frontendUrl}/api/og-image-dynamic?${imageParams.toString()}`;

        return composeMetadata({
          locale,
          title,
          description,
          url: `${frontendUrl}/join/${linkId}`,
          image: dynamicImageUrl,
          imageAlt,
          canonical: `${frontendUrl}/join/${linkId}`,
        });
      }
    }

    // Fallback metadata si l'appel API échoue
    return buildFallbackMetadata(locale, frontendUrl);
  } catch (error) {
    console.error('[generateMetadata] Erreur critique:', error);
    // Fallback metadata en cas d'erreur critique (même si params échoue)
    return buildFallbackMetadata(locale, frontendUrl);
  }
}

export default function JoinLayout({ children }: JoinLayoutProps) {
  return <>{children}</>;
}
