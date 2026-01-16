import { NextRequest, NextResponse } from 'next/server';
import { getOgImageUrl } from '@/lib/og-images';
import { buildApiUrl } from '@/lib/config';

interface MetadataResponse {
  title: string;
  description: string;
  image: string;
  url: string;
  type: 'website' | 'article';
  siteName: string;
  locale: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const affiliateToken = searchParams.get('affiliate');
    const linkId = searchParams.get('linkId');
    const type = searchParams.get('type') || 'default';

    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';

    let metadata: MetadataResponse;

    switch (type) {
      case 'affiliate':
        metadata = await generateAffiliateMetadata(affiliateToken, frontendUrl);
        break;
      case 'conversation':
        metadata = await generateConversationMetadata(linkId, frontendUrl);
        break;
      case 'join':
        metadata = await generateJoinMetadata(linkId, frontendUrl);
        break;
      default:
        metadata = generateDefaultMetadata(frontendUrl);
    }

    return NextResponse.json(metadata);
  } catch (error) {
    console.error('Erreur génération métadonnées:', error);
    return NextResponse.json(generateDefaultMetadata(), { status: 500 });
  }
}

async function generateAffiliateMetadata(
  affiliateToken: string | null,
  frontendUrl: string
): Promise<MetadataResponse> {
  if (!affiliateToken) {
    return generateDefaultMetadata(frontendUrl);
  }

  try {
    // Valider le token d'affiliation
    const response = await fetch(buildApiUrl(`/affiliate/validate/${affiliateToken}`));
    
    if (response.ok) {
      const data = await response.json();
      const affiliateUser = data.data?.affiliateUser;
      
      if (affiliateUser) {
        return {
          title: `Rejoignez Meeshy avec ${affiliateUser.firstName} ${affiliateUser.lastName}`,
          description: `Connectez-vous avec ${affiliateUser.firstName} et des milliers d'utilisateurs du monde entier sur Meeshy, la plateforme de messagerie multilingue en temps réel. Traduction automatique, conversations globales et plus encore !`,
          image: getOgImageUrl('affiliate', frontendUrl),
          url: `${frontendUrl}/signup?affiliate=${affiliateToken}`,
          type: 'website',
          siteName: 'Meeshy',
          locale: 'fr_FR'
        };
      }
    }
  } catch (error) {
    console.error('Erreur validation token affiliation:', error);
  }

  return generateDefaultMetadata(frontendUrl);
}

async function generateConversationMetadata(
  linkId: string | null,
  frontendUrl: string
): Promise<MetadataResponse> {
  if (!linkId) {
    return generateDefaultMetadata(frontendUrl);
  }

  try {
    // Récupérer les informations de la conversation
    const response = await fetch(buildApiUrl(`/links/${linkId}/info`));
    
    if (response.ok) {
      const data = await response.json();
      const shareLink = data.data?.shareLink;
      
      if (shareLink) {
        return {
          title: `${shareLink.conversation?.title || 'Conversation Meeshy'} - Rejoignez la discussion`,
          description: shareLink.description || `Rejoignez cette conversation sur Meeshy et discutez en temps réel avec traduction automatique dans plus de 100 langues.`,
          image: getOgImageUrl('default', frontendUrl),
          url: `${frontendUrl}/join/${linkId}`,
          type: 'website',
          siteName: 'Meeshy',
          locale: 'fr_FR'
        };
      }
    }
  } catch (error) {
    console.error('Erreur récupération conversation:', error);
  }

  return generateDefaultMetadata(frontendUrl);
}

async function generateJoinMetadata(
  linkId: string | null,
  frontendUrl: string
): Promise<MetadataResponse> {
  if (!linkId) {
    return generateDefaultMetadata(frontendUrl);
  }

  try {
    // Récupérer les informations du lien de jointure
    const response = await fetch(buildApiUrl(`/links/${linkId}/info`));
    
    if (response.ok) {
      const data = await response.json();
      const shareLink = data.data?.shareLink;
      
      if (shareLink) {
        return {
          title: `Rejoignez ${shareLink.conversation?.title || 'cette conversation'} sur Meeshy`,
          description: `Participez à une conversation multilingue en temps réel. Traduction automatique, partage de fichiers et discussions globales sur Meeshy.`,
          image: getOgImageUrl('signin', frontendUrl),
          url: `${frontendUrl}/join/${linkId}`,
          type: 'website',
          siteName: 'Meeshy',
          locale: 'fr_FR'
        };
      }
    }
  } catch (error) {
    console.error('Erreur récupération lien jointure:', error);
  }

  return generateDefaultMetadata(frontendUrl);
}

function generateDefaultMetadata(frontendUrl: string = 'https://meeshy.me'): MetadataResponse {
  return {
    title: 'Meeshy - Messagerie Multilingue en Temps Réel',
    description: 'Connectez-vous avec le monde entier grâce à Meeshy, la plateforme de messagerie multilingue avec traduction automatique en temps réel. Plus de 100 langues supportées, conversations globales et partage de fichiers.',
    image: getOgImageUrl('default', frontendUrl),
    url: frontendUrl,
    type: 'website',
    siteName: 'Meeshy',
    locale: 'fr_FR'
  };
}
