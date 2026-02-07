/**
 * Utilitaires pour la génération et gestion des liens de partage
 */

import { buildApiUrl } from './config';

export interface ShareLinkOptions {
  type: 'affiliate' | 'conversation' | 'join' | 'default';
  affiliateToken?: string;
  linkId?: string;
  conversationId?: string;
  customTitle?: string;
  customDescription?: string;
}

export interface ShareMetadata {
  title: string;
  description: string;
  image: string;
  url: string;
  type: string;
  siteName: string;
  locale: string;
}

/**
 * Génère un lien de partage complet avec les paramètres appropriés
 */
export function generateShareLink(options: ShareLinkOptions): string {
  const baseUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me';
  
  switch (options.type) {
    case 'affiliate':
      if (!options.affiliateToken) {
        throw new Error('Token d\'affiliation requis pour ce type de lien');
      }
      return `${baseUrl}/signup/affiliate/${options.affiliateToken}`;
    
    case 'conversation':
      if (!options.linkId) {
        throw new Error('LinkId requis pour ce type de lien');
      }
      return `${baseUrl}/join/${options.linkId}`;
    
    case 'join':
      if (!options.linkId) {
        throw new Error('LinkId requis pour ce type de lien');
      }
      return `${baseUrl}/join/${options.linkId}`;
    
    case 'default':
    default:
      return baseUrl;
  }
}

/**
 * Génère des métadonnées de partage pour les réseaux sociaux
 */
export async function generateShareMetadata(options: ShareLinkOptions): Promise<ShareMetadata> {
  const url = generateShareLink(options);
  
  try {
    const params = new URLSearchParams({
      type: options.type,
      ...(options.affiliateToken && { affiliate: options.affiliateToken }),
      ...(options.linkId && { linkId: options.linkId }),
    });

    const response = await fetch(`/api/metadata?${params}`);
    
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('Erreur génération métadonnées:', error);
  }

  // Fallback vers des métadonnées par défaut
  return {
    title: options.customTitle || 'Meeshy - Messagerie Multilingue en Temps Réel',
    description: options.customDescription || 'Connectez-vous avec le monde entier grâce à Meeshy, la plateforme de messagerie multilingue avec traduction automatique en temps réel.',
    image: `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me'}/images/meeshy-og-default.jpg`,
    url,
    type: 'website',
    siteName: 'Meeshy',
    locale: 'fr_FR'
  };
}

/**
 * Partage un lien via l'API Web Share ou copie dans le presse-papiers
 */
export async function shareLink(
  url: string, 
  title: string, 
  description: string
): Promise<boolean> {
  try {
    // Utiliser l'API Web Share si disponible
    if (navigator.share) {
      await navigator.share({
        title,
        text: description,
        url,
      });
      return true;
    } else {
      // Fallback vers la copie dans le presse-papiers
      await navigator.clipboard.writeText(url);
      return false; // Indique que c'est une copie, pas un partage
    }
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('Erreur lors du partage:', error);
      throw error;
    }
    return false;
  }
}

/**
 * Valide un token d'affiliation
 */
export async function validateAffiliateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(buildApiUrl(`/affiliate/validate/${token}`));
    return response.ok;
  } catch (error) {
    console.error('Erreur validation token affiliation:', error);
    return false;
  }
}

/**
 * Valide un lien de conversation
 */
export async function validateConversationLink(linkId: string): Promise<boolean> {
  try {
    const response = await fetch(buildApiUrl(`/links/${linkId}/info`));
    return response.ok;
  } catch (error) {
    console.error('Erreur validation lien conversation:', error);
    return false;
  }
}

/**
 * Génère un QR code pour un lien de partage (optionnel)
 */
export function generateQRCodeData(url: string): string {
  // Cette fonction pourrait être étendue pour générer des QR codes
  // Pour l'instant, on retourne juste l'URL
  return url;
}

/**
 * Obtient les statistiques de partage d'un lien (optionnel)
 */
export async function getShareStats(linkId: string): Promise<{
  views: number;
  shares: number;
  clicks: number;
} | null> {
  try {
    const response = await fetch(buildApiUrl(`/links/${linkId}/stats`));

    if (response.ok) {
      const data = await response.json();
      return data.data;
    }
  } catch (error) {
    console.error('Erreur récupération statistiques:', error);
  }

  return null;
}
