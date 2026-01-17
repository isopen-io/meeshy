/**
 * Service CRUD de base pour les conversations
 * Responsabilité: Opérations CRUD (Create, Read, Update, Delete) sur les conversations
 */

import { apiService } from '../api.service';
import { cacheService } from './cache.service';
import { transformersService } from './transformers.service';
import type {
  Conversation,
  CreateConversationRequest,
} from '@meeshy/shared/types';
import type {
  GetConversationsOptions,
  GetConversationsResponse,
} from './types';

/**
 * Service pour les opérations CRUD de conversations
 */
export class ConversationsCrudService {
  /**
   * Obtenir toutes les conversations de l'utilisateur avec pagination et filtres
   */
  async getConversations(options: GetConversationsOptions = {}): Promise<GetConversationsResponse> {
    const { limit = 20, offset = 0, skipCache = false, type, withUserId } = options;

    // Vérifier le cache (seulement pour la première page sans offset et sans filtres)
    if (!skipCache && offset === 0 && !type && !withUserId) {
      const cachedConversations = cacheService.getConversationsFromCache();
      if (cachedConversations) {
        return {
          conversations: cachedConversations,
          pagination: {
            limit,
            offset: 0,
            total: cachedConversations.length,
            hasMore: false
          }
        };
      }
    }

    const queryParams: Record<string, string> = {
      limit: limit.toString(),
      offset: offset.toString()
    };
    if (type) queryParams.type = type;
    if (withUserId) queryParams.withUserId = withUserId;

    const response = await apiService.get<{
      success: boolean;
      data: unknown[];
      pagination?: {
        limit: number;
        offset: number;
        total: number;
        hasMore: boolean;
      };
    }>('/conversations', queryParams);

    if (!response.data?.success || !Array.isArray(response.data?.data)) {
      throw new Error('Format de réponse invalide pour les conversations');
    }

    const conversations = response.data.data.map(conv =>
      transformersService.transformConversationData(conv)
    );

    // Mettre en cache les conversations (seulement pour la première page)
    if (offset === 0) {
      cacheService.setConversationsCache(conversations);
    }

    return {
      conversations,
      pagination: response.data.pagination ?? {
        limit,
        offset,
        total: conversations.length,
        hasMore: false
      }
    };
  }

  /**
   * Obtenir une conversation spécifique par ID
   */
  async getConversation(id: string): Promise<Conversation> {
    const response = await apiService.get<{ success: boolean; data: unknown }>(
      `/conversations/${id}`
    );

    if (!response.data?.success || !response.data?.data) {
      throw new Error('Conversation non trouvée');
    }

    return transformersService.transformConversationData(response.data.data);
  }

  /**
   * Créer une nouvelle conversation
   */
  async createConversation(data: CreateConversationRequest): Promise<Conversation> {
    const response = await apiService.post<{ success: boolean; data: unknown }>(
      '/conversations',
      data
    );

    if (!response.data?.data) {
      throw new Error('Erreur lors de la création de la conversation');
    }

    // Invalider le cache
    cacheService.invalidateConversationsCache();

    return transformersService.transformConversationData(response.data.data);
  }

  /**
   * Mettre à jour une conversation
   */
  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation> {
    const response = await apiService.patch<Conversation>(`/conversations/${id}`, data);

    if (!response.data) {
      throw new Error('Erreur lors de la mise à jour de la conversation');
    }

    // Invalider le cache
    cacheService.invalidateConversationsCache();

    return response.data;
  }

  /**
   * Supprimer une conversation
   */
  async deleteConversation(id: string): Promise<void> {
    await apiService.delete(`/conversations/${id}`);

    // Invalider le cache
    cacheService.invalidateConversationsCache();
  }

  /**
   * Rechercher dans les conversations
   */
  async searchConversations(query: string): Promise<Conversation[]> {
    const response = await apiService.get<Conversation[]>(
      '/api/conversations/search',
      { q: query }
    );
    return response.data ?? [];
  }

  /**
   * Obtenir toutes les conversations directes avec un utilisateur spécifique
   */
  async getConversationsWithUser(userId: string): Promise<Conversation[]> {
    try {
      const { conversations } = await this.getConversations({
        skipCache: true,
        type: 'direct',
        withUserId: userId
      });

      // Trier par activité récente
      conversations.sort((a, b) => {
        const dateA = a.lastActivityAt || a.updatedAt || a.createdAt;
        const dateB = b.lastActivityAt || b.updatedAt || b.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      return conversations;
    } catch (error) {
      console.error('Erreur lors de la récupération des conversations avec l\'utilisateur:', error);
      return [];
    }
  }
}

export const conversationsCrudService = new ConversationsCrudService();
