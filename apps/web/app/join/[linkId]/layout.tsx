import { Metadata } from 'next';
import { ReactNode } from 'react';

interface JoinLayoutProps {
  children: ReactNode;
  params: Promise<{ linkId: string }>; // Next.js 15: params est une Promise
}

export async function generateMetadata({ params }: JoinLayoutProps): Promise<Metadata> {
  const { linkId } = await params; // Next.js 15: params est une Promise
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

  try {
    // Récupérer les informations du lien d'invitation
    const response = await fetch(`${backendUrl}/anonymous/link/${linkId}`, {
      next: { revalidate: 300 } // Cache 5 minutes
    });

    if (response.ok) {
      const result = await response.json();

      if (result.success && result.data) {
        const link = result.data;
        const conversation = link.conversation;

        // Déterminer le type de conversation pour le badge
        const getConversationType = (type: string | undefined) => {
          switch (type) {
            case 'group': return 'Groupe';
            case 'direct': return 'Discussion directe';
            case 'public': return 'Public';
            case 'global': return 'Global';
            default: return 'Conversation';
          }
        };

        const conversationType = getConversationType(conversation?.type);
        const conversationTitle = conversation?.title || 'Sans nom';
        const creatorName = link.creator
          ? (link.creator.displayName || `${link.creator.firstName || ''} ${link.creator.lastName || ''}`.trim() || link.creator.username)
          : 'Un utilisateur';

        const title = `Rejoindre "${conversationTitle}" - Meeshy`;
        const description = link.description
          ? `${link.description} - Invitation de ${creatorName}`
          : `${creatorName} vous invite à rejoindre "${conversationTitle}" sur Meeshy`;

        // Construire l'URL de l'image dynamique
        const imageParams = new URLSearchParams({
          type: 'invitation',
          title: conversationTitle,
          subtitle: `${conversationType} • ${link.stats?.totalParticipants || 0} participant${(link.stats?.totalParticipants || 0) > 1 ? 's' : ''}`,
          userName: creatorName,
          message: link.description || `Rejoignez cette conversation sur Meeshy`
        });

        const dynamicImageUrl = `${frontendUrl}/api/og-image-dynamic?${imageParams.toString()}`;

        return {
          title,
          description,
          openGraph: {
            title,
            description,
            url: `${frontendUrl}/join/${linkId}`,
            siteName: 'Meeshy',
            images: [
              {
                url: dynamicImageUrl,
                width: 1200,
                height: 630,
                alt: `Invitation - ${conversationTitle}`,
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
            canonical: `${frontendUrl}/join/${linkId}`,
          },
        };
      }
    }
  } catch (error) {
    console.error('Erreur génération métadonnées invitation:', error);
  }

  // Fallback metadata si l'appel API échoue
  return {
    title: 'Rejoindre une conversation - Meeshy',
    description: 'Vous avez été invité à rejoindre une conversation sur Meeshy, la plateforme de messagerie multilingue en temps réel.',
    openGraph: {
      title: 'Rejoindre une conversation - Meeshy',
      description: 'Rejoignez des conversations multilingues en temps réel sur Meeshy.',
      url: `${frontendUrl}/join/${linkId}`,
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
      title: 'Rejoindre une conversation - Meeshy',
      description: 'Rejoignez des conversations multilingues en temps réel sur Meeshy.',
      images: [`${frontendUrl}/og-image-meeshy.png`],
      creator: '@meeshy_app',
    },
  };
}

export default function JoinLayout({ children }: JoinLayoutProps) {
  return <>{children}</>;
}
