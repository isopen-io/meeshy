/**
 * Service de gestion des messages
 * Responsabilité: Opérations sur les messages (récupération, envoi, marquage)
 */

import { apiService } from '../api.service';
import { cacheService } from './cache.service';
import { transformersService } from './transformers.service';
import type {
  Message,
  SendMessageRequest,
  PaginationMeta,
} from '@meeshy/shared/types';
import type {
  GetMessagesResponse,
  MarkAsReadResponse,
} from './types';

/**
 * Service pour les opérations sur les messages
 */
export class MessagesService {
  private pendingRequests: Map<string, AbortController> = new Map();

  /**
   * Réponse vide pour les cas d'erreur (évite allocations répétées)
   */
  private static readonly EMPTY_MESSAGES_RESPONSE: GetMessagesResponse = {
    messages: [],
    total: 0,
    hasMore: false,
  };

  /**
   * Obtenir les messages d'une conversation avec pagination
   */
  async getMessages(
    conversationId: string,
    page = 1,
    limit = 20
  ): Promise<GetMessagesResponse> {
    try {
      const requestKey = `messages-${conversationId}`;
      const controller = this.createRequestController(requestKey);

      const offset = (page - 1) * limit;

      const response = await apiService.get<{
        success: boolean;
        data: unknown[];
        pagination?: PaginationMeta;
        meta?: { userLanguage?: string };
      }>(
        `/conversations/${conversationId}/messages`,
        { offset, limit },
        { signal: controller.signal }
      );

      this.pendingRequests.delete(requestKey);

      if (!response.data?.success || !Array.isArray(response.data?.data)) {
        console.warn('⚠️ Structure de réponse inattendue:', response.data);
        return MessagesService.EMPTY_MESSAGES_RESPONSE;
      }

      const transformedMessages = response.data.data.map(msg =>
        transformersService.transformMessageData(msg)
      );

      const pagination = response.data.pagination;

      return {
        messages: transformedMessages,
        total: pagination?.total ?? transformedMessages.length,
        hasMore: pagination?.hasMore ?? false,
        pagination,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('REQUEST_CANCELLED');
      }

      console.error('❌ Erreur lors du chargement des messages:', error);
      return MessagesService.EMPTY_MESSAGES_RESPONSE;
    }
  }

  /**
   * Envoyer un message dans une conversation
   */
  async sendMessage(conversationId: string, data: SendMessageRequest): Promise<Message> {
    const response = await apiService.post<{ success: boolean; data: Message }>(
      `/conversations/${conversationId}/messages`,
      data
    );

    if (!response.data?.data) {
      throw new Error('Erreur lors de l\'envoi du message');
    }

    // Invalider le cache des messages
    cacheService.invalidateMessagesCache(conversationId);

    return response.data.data;
  }

  /**
   * Marquer une conversation comme lue
   */
  async markAsRead(conversationId: string): Promise<void> {
    await apiService.post(`/conversations/${conversationId}/read`);
  }

  /**
   * Marquer tous les messages d'une conversation comme lus
   */
  async markConversationAsRead(conversationId: string): Promise<MarkAsReadResponse> {
    const requestKey = `mark-read-${conversationId}`;
    const controller = this.createRequestController(requestKey);

    try {
      const response = await apiService.post<MarkAsReadResponse>(
        `/conversations/${conversationId}/mark-read`,
        {}
      );

      this.pendingRequests.delete(requestKey);

      if (!response.data) {
        throw new Error('Erreur lors du marquage comme lu');
      }

      return response.data;
    } catch (error) {
      this.pendingRequests.delete(requestKey);
      throw error;
    }
  }

  /**
   * Crée un nouveau controller pour une requête
   */
  private createRequestController(key: string): AbortController {
    this.cancelPendingRequest(key);
    const controller = new AbortController();
    this.pendingRequests.set(key, controller);
    return controller;
  }

  /**
   * Annule une requête en cours
   */
  private cancelPendingRequest(key: string): void {
    const controller = this.pendingRequests.get(key);
    if (controller) {
      controller.abort();
      this.pendingRequests.delete(key);
    }
  }
}

export const messagesService = new MessagesService();
