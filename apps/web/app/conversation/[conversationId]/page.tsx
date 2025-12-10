import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface ConversationPageProps {
  params: { conversationId: string };
}

export async function generateMetadata({ params }: ConversationPageProps): Promise<Metadata> {
  const { conversationId } = params;
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';
  
  try {
    // Récupérer les informations de la conversation
    const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/conversations/${conversationId}`, {
      next: { revalidate: 300 } // Cache 5 minutes
    });
    
    if (response.ok) {
      const data = await response.json();
      const conversation = data.data?.conversation;
      
      if (conversation) {
        const title = `Conversation ${conversation.title || 'Meeshy'}`;
        const description = `Rejoignez cette conversation sur Meeshy, la plateforme de messagerie multilingue en temps réel.`;
        
        // Construire l'URL de l'image dynamique
        const imageParams = new URLSearchParams({
          type: 'conversation',
          title: conversation.title || 'Conversation',
          subtitle: 'Rejoignez la discussion',
          userName: conversation.createdBy?.firstName + ' ' + conversation.createdBy?.lastName || 'Utilisateur'
        });
        
        const dynamicImageUrl = `${frontendUrl}/api/og-image-dynamic?${imageParams.toString()}`;
        
        return {
          title,
          description,
          openGraph: {
            title,
            description,
            url: `${frontendUrl}/conversation/${conversationId}`,
            siteName: 'Meeshy',
            images: [
              {
                url: dynamicImageUrl,
                width: 1200,
                height: 630,
                alt: `Conversation ${conversation.title || 'Meeshy'}`,
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
            canonical: `${frontendUrl}/conversation/${conversationId}`,
          },
        };
      }
    }
  } catch (error) {
    console.error('Erreur génération métadonnées conversation:', error);
  }

  // Si la conversation n'existe pas
  notFound();
}

export default function ConversationPage({ params }: ConversationPageProps) {
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
