import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildApiUrl } from '@/lib/config';
import { getServerLocale } from '@/lib/i18n/server-locale';
import { composeMetadata, getMetadataPage, interpolate, pageString } from '@/lib/i18n/metadata';

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export async function generateMetadata({ params }: ConversationPageProps): Promise<Metadata> {
  const { conversationId } = await params;
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';
  const locale = await getServerLocale();
  const meta = getMetadataPage(locale, 'conversationDetail');

  try {
    // Récupérer les informations de la conversation
    const response = await fetch(buildApiUrl(`/conversations/${conversationId}`), {
      next: { revalidate: 300 } // Cache 5 minutes
    });

    if (response.ok) {
      const data = await response.json();
      const conversation = data.data?.conversation;

      if (conversation) {
        const conversationTitle = conversation.title || pageString(meta, 'defaultTitle');
        const title = interpolate(pageString(meta, 'title'), { title: conversationTitle });
        const description = pageString(meta, 'description');
        const imageAlt = interpolate(pageString(meta, 'ogImageAlt'), { title: conversationTitle });

        const creatorName = `${conversation.createdBy?.firstName ?? ''} ${conversation.createdBy?.lastName ?? ''}`.trim()
          || pageString(meta, 'defaultUserName');

        // Construire l'URL de l'image dynamique
        const imageParams = new URLSearchParams({
          type: 'conversation',
          title: conversationTitle,
          subtitle: pageString(meta, 'imageSubtitle'),
          userName: creatorName,
        });

        const dynamicImageUrl = `${frontendUrl}/api/og-image-dynamic?${imageParams.toString()}`;

        return composeMetadata({
          locale,
          title,
          description,
          url: `${frontendUrl}/conversation/${conversationId}`,
          image: dynamicImageUrl,
          imageAlt,
          canonical: `${frontendUrl}/conversation/${conversationId}`,
        });
      }
    }
  } catch (error) {
    console.error('Erreur génération métadonnées conversation:', error);
  }

  // Si la conversation n'existe pas
  notFound();
}

export default function ConversationPage() {
  // Rediriger vers la page de conversation dans l'application
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Redirection...</h1>
        <p>Vous allez être redirigé vers la conversation.</p>
      </div>
    </div>
  );
}
