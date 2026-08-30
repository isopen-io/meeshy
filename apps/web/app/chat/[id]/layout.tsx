import { Metadata } from 'next';
import { ReactNode } from 'react';
import { getServerLocale } from '@/lib/i18n/server-locale';
import { ogImageUrl } from '@/lib/og-image-params';
import {
  buildPageMetadata,
  composeMetadata,
  getMetadataPage,
  interpolate,
  pageMap,
  pageString,
} from '@/lib/i18n/metadata';

/**
 * `/chat/:sharedId` est désormais l'URL canonique d'un lien de partage — c'est
 * elle qui est collée dans WhatsApp, iMessage ou Slack. Les métadonnées riches
 * (titre de la conversation, créateur, nombre de participants, image OG
 * générée) vivaient sur `/join/:linkId` ; elles déménagent ici avec l'URL,
 * sinon chaque lien partagé perdrait son aperçu.
 *
 * Les libellés restent ceux du namespace `join` : c'est le même acte social —
 * « X vous invite à rejoindre Y » — et les 4 locales les servent déjà.
 */
interface SharedChatLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: SharedChatLayoutProps): Promise<Metadata> {
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me';
  const locale = await getServerLocale();
  const { id } = await params;

  const fallback = () =>
    buildPageMetadata('chat', {
      url: `${frontendUrl}/chat/${id}`,
      image: `${frontendUrl}/images/meeshy-og-exchange.jpg`,
      canonical: `${frontendUrl}/chat/${id}`,
    });

  // Une conversation interne (ObjectId) n'a pas d'aperçu public à exposer.
  if (!id?.startsWith('mshy_')) return fallback();

  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const response = await fetch(`${backendUrl}/anonymous/link/${id}`, {
      next: { revalidate: 300 },
    }).catch((error) => {
      console.error('[chat/generateMetadata] Fetch error:', error);
      return null;
    });

    if (!response?.ok) return fallback();

    const result = await response.json();
    if (!result?.success || !result.data) return fallback();

    const meta = getMetadataPage(locale, 'join');
    const link = result.data;
    const conversation = link.conversation;
    const types = pageMap(meta, 'types');

    const conversationType = types[conversation?.type as string] || types.default;
    const conversationTitle = conversation?.title || pageString(meta, 'untitled');
    const creatorName = link.creator
      ? link.creator.displayName ||
        `${link.creator.firstName || ''} ${link.creator.lastName || ''}`.trim() ||
        link.creator.username
      : pageString(meta, 'someone');

    const participantsLabel = interpolate(pageString(meta, 'participants'), {
      count: link.stats?.totalParticipants || 0,
    });

    const imageParams = new URLSearchParams({
      type: 'invitation',
      title: conversationTitle,
      subtitle: `${conversationType} • ${participantsLabel}`,
      userName: creatorName,
      message: link.description || pageString(meta, 'imageMessage'),
    });

    return composeMetadata({
      locale,
      title: interpolate(pageString(meta, 'title'), { title: conversationTitle }),
      description: link.description
        ? interpolate(pageString(meta, 'descriptionWithDescription'), {
            description: link.description,
            creator: creatorName,
          })
        : interpolate(pageString(meta, 'descriptionDefault'), {
            creator: creatorName,
            title: conversationTitle,
          }),
      url: `${frontendUrl}/chat/${id}`,
      image: ogImageUrl(frontendUrl, imageParams),
      imageAlt: interpolate(pageString(meta, 'ogImageAlt'), { title: conversationTitle }),
      canonical: `${frontendUrl}/chat/${id}`,
    });
  } catch (error) {
    console.error('[chat/generateMetadata] Erreur critique:', error);
    return fallback();
  }
}

export default function SharedChatLayout({ children }: SharedChatLayoutProps) {
  return children;
}
