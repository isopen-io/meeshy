import { apiService } from './api.service';
import type { ApiResponse } from '@meeshy/shared/types';
import type { MentionSuggestion } from '@meeshy/shared/types/mention';

export interface MentionSuggestionsParams {
  conversationId: string;
  query?: string;
}

export interface MentionSuggestionsResponse {
  success: boolean;
  data: MentionSuggestion[];
}

export interface MentionItem {
  id: string;
  messageId: string;
  mentionedUserId: string;
  mentionedAt: Date;
  mentionedUser: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
  };
}

export interface UserMention {
  id: string;
  messageId: string;
  mentionedAt: Date;
  message: {
    id: string;
    content: string;
    conversationId: string;
    senderId: string;
    createdAt: Date;
    sender: {
      id: string;
      username: string;
      displayName: string | null;
      avatar: string | null;
    } | null;
    conversation: {
      id: string;
      title: string | null;
      type: string;
    };
  };
}

/**
 * Service pour gérer les mentions d'utilisateurs (@username)
 */
export const mentionsService = {
  /**
   * Obtient des suggestions d'utilisateurs pour l'autocomplete de mention
   *
   * @param conversationId - ID de la conversation
   * @param query - Texte de recherche optionnel
   * @returns Liste de suggestions triées par pertinence
   */
  async getSuggestions(
    conversationId: string,
    query?: string
  ): Promise<MentionSuggestion[]> {
    try {
      console.log('[MentionsService] Fetching suggestions', { conversationId, query });

      // Valider que conversationId est un ObjectId MongoDB valide (24 caractères hexadécimaux)
      if (!/^[a-f\d]{24}$/i.test(conversationId)) {
        console.warn('[MentionsService] Invalid conversationId format:', conversationId);
        return [];
      }

      const params: Record<string, string> = { conversationId };
      if (query) {
        params.query = query;
      }

      const response = await apiService.get<MentionSuggestionsResponse>(
        '/mentions/suggestions',
        params
      );

      console.log('[MentionsService] Suggestions received:', response.data);

      if (response.data.success && response.data.data) {
        return response.data.data;
      }

      return [];
    } catch (error) {
      console.error('[MentionsService] Error fetching suggestions:', error);
      return [];
    }
  },

  /**
   * Récupère les utilisateurs mentionnés dans un message
   *
   * @param messageId - ID du message
   * @returns Liste des utilisateurs mentionnés
   */
  async getMessageMentions(messageId: string): Promise<MentionItem[]> {
    try {
      const response = await apiService.get<{ success: boolean; data: MentionItem[] }>(
        `/mentions/messages/${messageId}`
      );

      if (response.data.success && response.data.data) {
        return response.data.data;
      }

      return [];
    } catch (error) {
      console.error('[MentionsService] Error fetching message mentions:', error);
      return [];
    }
  },

  /**
   * Récupère les mentions récentes de l'utilisateur actuel
   *
   * @param limit - Nombre maximum de mentions à retourner
   * @returns Liste des mentions récentes
   */
  async getUserMentions(limit: number = 50): Promise<UserMention[]> {
    try {
      const response = await apiService.get<{ success: boolean; data: UserMention[] }>(
        '/mentions/me',
        { limit }
      );

      if (response.data.success && response.data.data) {
        return response.data.data;
      }

      return [];
    } catch (error) {
      console.error('[MentionsService] Error fetching user mentions:', error);
      return [];
    }
  },

  /**
   * Vérifie si un message contient des mentions (@username)
   *
   * @param content - Contenu du message
   * @returns true si le message contient des mentions
   */
  hasMentions(content: string): boolean {
    return /@\w+/.test(content);
  },

  /**
   * Extrait les usernames mentionnés d'un message
   *
   * @param content - Contenu du message
   * @returns Array des usernames (sans le @)
   */
  extractMentions(content: string): string[] {
    const mentions = content.match(/@(\w+)/g);
    return mentions ? mentions.map(mention => mention.substring(1)) : [];
  },
};

export default mentionsService;
