/**
 * Service CRUD de base pour les conversations
 * Responsabilité: Opérations CRUD (Create, Read, Update, Delete) sur les conversations
 */

import { apiService } from '../api.service';
import { logger } from '@/utils/logger';
import { transformersService } from './transformers.service';
import type {
  Conversation,
  CreateConversationRequest,
  CursorPaginationMeta,
} from '@meeshy/shared/types';
import type {
  GetConversationsOptions,
  GetConversationsResponse,
  EncryptionMode,
  EncryptionStatus,
  EnableEncryptionResult,
} from './types';

/**
 * Service pour les opérations CRUD de conversations
 */
export class ConversationsCrudService {
  /**
   * Obtenir toutes les conversations de l'utilisateur avec pagination et filtres
   */
  async getConversations(options: GetConversationsOptions = {}): Promise<GetConversationsResponse> {
    const { limit = 20, offset = 0, type, withUserId, before } = options;

    const queryParams: Record<string, string> = {
      limit: limit.toString(),
    };
    if (before) {
      queryParams.before = before;
    } else {
      queryParams.offset = offset.toString();
    }
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
      cursorPagination?: CursorPaginationMeta;
    }>('/conversations', queryParams);

    if (!response.data?.success || !Array.isArray(response.data?.data)) {
      throw new Error('Format de réponse invalide pour les conversations');
    }

    const conversations = response.data.data.map(conv =>
      transformersService.transformConversationData(conv)
    );

    const cursorPagination = response.data.cursorPagination;

    return {
      conversations,
      pagination: response.data.pagination ?? {
        limit,
        offset,
        total: conversations.length,
        // Conservative fallback when the backend omits pagination meta:
        // a full page implies there might be more. Previously hard-coded
        // to `false`, which froze infinite scroll after the very first
        // request whenever the response shape unexpectedly omitted
        // `pagination` (e.g. cursor-only mode, fielded responses).
        hasMore: conversations.length >= limit
      },
      cursorPagination,
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


    return response.data;
  }

  /**
   * Supprimer une conversation
   */
  async deleteConversation(id: string): Promise<void> {
    await apiService.delete(`/conversations/${id}`);
  }

  async getEncryptionStatus(id: string): Promise<EncryptionStatus> {
    const response = await apiService.get<EncryptionStatus>(
      `/conversations/${id}/encryption-status`
    );
    if (!response.data) {
      throw new Error('Erreur lors de la lecture du statut de chiffrement');
    }
    return response.data;
  }

  async enableEncryption(id: string, mode: EncryptionMode): Promise<EnableEncryptionResult> {
    const response = await apiService.post<EnableEncryptionResult>(
      `/conversations/${id}/encryption`,
      { mode }
    );
    if (!response.data) {
      throw new Error("Erreur lors de l'activation du chiffrement");
    }
    return response.data;
  }

  /**
   * Rechercher dans les conversations
   */
  async searchConversations(query: string): Promise<Conversation[]> {
    try {
      const response = await apiService.get<{ success: boolean; data: Conversation[] }>(
        '/conversations/search',
        { q: query }
      );

      let rawData: Conversation[] = [];
      if (Array.isArray(response.data)) {
        rawData = response.data;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        rawData = response.data.data;
      }

      return rawData.map(conv =>
        transformersService.transformConversationData(conv)
      );
    } catch (error) {
      logger.error('[ConversationsCrud]', 'Error searching conversations', { error });
      return [];
    }
  }

  /**
   * Obtenir toutes les conversations directes avec un utilisateur spécifique
   */
  async getConversationsWithUser(userId: string): Promise<Conversation[]> {
    try {
      const { conversations } = await this.getConversations({
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
      logger.error('[ConversationsCrud]', "Erreur lors de la récupération des conversations avec l'utilisateur", { error });
      return [];
    }
  }
}

export const conversationsCrudService = new ConversationsCrudService();
