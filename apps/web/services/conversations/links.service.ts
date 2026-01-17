/**
 * Service de gestion des liens d'invitation
 * Responsabilité: Création et gestion des liens de partage de conversations
 */

import { apiService } from '../api.service';
import { conversationsCrudService } from './crud.service';
import { generateLinkName } from '@/utils/link-name-generator';
import { authManager } from '../auth-manager.service';
import type { CreateLinkData } from './types';

/**
 * Service pour les opérations sur les liens d'invitation
 */
export class LinksService {
  /**
   * Créer un lien d'invitation pour une conversation
   */
  async createInviteLink(conversationId: string, linkData?: CreateLinkData): Promise<string> {
    try {
      let linkName = linkData?.name;

      if (!linkName) {
        try {
          const conversation = await conversationsCrudService.getConversation(conversationId);
          const conversationTitle = conversation.title || 'Conversation';

          let durationDays: number | undefined;
          if (linkData?.expiresAt) {
            const expirationDate = new Date(linkData.expiresAt);
            const now = new Date();
            durationDays = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          }

          const userData = typeof window !== 'undefined' ? authManager.getCurrentUser() : null;
          const userLanguage = userData?.systemLanguage || 'fr';

          linkName = generateLinkName({
            conversationTitle,
            language: userLanguage,
            durationDays: durationDays || 7,
            maxUses: linkData?.maxUses,
            isPublic: !linkData?.maxUses
          });
        } catch (error) {
          console.warn('Impossible de récupérer les détails de la conversation pour générer le nom du lien:', error);
          linkName = 'Lien d\'invitation';
        }
      }

      const response = await apiService.post<{
        success: boolean;
        data: { link: string; code: string; shareLink: any };
      }>(`/conversations/${conversationId}/new-link`, {
        name: linkName,
        description: linkData?.description || 'Rejoignez cette conversation',
        maxUses: linkData?.maxUses,
        expiresAt: linkData?.expiresAt,
        allowAnonymousMessages: linkData?.allowAnonymousMessages ?? true,
        allowAnonymousFiles: linkData?.allowAnonymousFiles ?? false,
        allowAnonymousImages: linkData?.allowAnonymousImages ?? true,
        allowViewHistory: linkData?.allowViewHistory ?? true,
        requireNickname: linkData?.requireNickname ?? true,
        requireEmail: linkData?.requireEmail ?? false
      });

      if (!response.data?.data?.link) {
        throw new Error('Erreur lors de la création du lien');
      }

      return response.data.data.link;
    } catch (error: any) {
      if (error.status === 403) {
        if (error.message?.includes('Accès non autorisé')) {
          throw new Error('Vous n\'êtes pas membre de cette conversation. Seuls les membres peuvent créer des liens de partage.');
        } else if (error.message?.includes('Seuls les administrateurs')) {
          throw new Error('Seuls les administrateurs et modérateurs peuvent créer des liens de partage pour cette conversation.');
        } else {
          throw new Error('Vous n\'avez pas les permissions nécessaires pour créer un lien de partage.');
        }
      } else if (error.status === 404) {
        throw new Error('Conversation non trouvée.');
      } else {
        throw new Error('Erreur lors de la création du lien de partage. Veuillez réessayer.');
      }
    }
  }

  /**
   * Créer une nouvelle conversation avec un lien d'invitation
   */
  async createConversationWithLink(linkData: CreateLinkData = {}): Promise<string> {
    const response = await apiService.post<{
      success: boolean;
      data: { linkId: string; conversationId: string; shareLink: any };
    }>('/api/links', {
      name: linkData.name || 'Nouvelle conversation',
      description: linkData.description || 'Rejoignez cette conversation',
      maxUses: linkData.maxUses,
      expiresAt: linkData.expiresAt,
      allowAnonymousMessages: linkData.allowAnonymousMessages ?? true,
      allowAnonymousFiles: linkData.allowAnonymousFiles ?? false,
      allowAnonymousImages: linkData.allowAnonymousImages ?? true,
      allowViewHistory: linkData.allowViewHistory ?? true,
      requireNickname: linkData.requireNickname ?? true,
      requireEmail: linkData.requireEmail ?? false
    });

    if (!response.data?.data?.linkId) {
      throw new Error('Erreur lors de la création de la conversation avec lien');
    }

    return `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://meeshy.me'}/join/${response.data.data.linkId}`;
  }
}

export const linksService = new LinksService();
