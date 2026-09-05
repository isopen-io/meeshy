/**
 * Service de gestion des messages
 * Responsabilité: Opérations sur les messages (récupération, envoi, marquage)
 */

import { apiService } from '../api.service';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { logger } from '@/utils/logger';
import { transformersService } from './transformers.service';
import { splitConsumedLanguages } from '@/utils/consumed-language';
import type {
  Message,
  SendMessageRequest,
  PaginationMeta,
  CursorPaginationMeta,
} from '@meeshy/shared/types';
import type {
  GetMessagesResponse,
  MarkAsReadResponse,
} from './types';

/** ObjectId MongoDB — écarte les ids optimistes `cid_<uuid>` des messages en vol. */
const SERVER_MESSAGE_ID = /^[0-9a-fA-F]{24}$/;

/** Plafond du lot accepté par `MarkReadBodySchema` côté gateway. */
const MARK_READ_BATCH_LIMIT = 200;

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
    limit = 20,
    cursor?: string | null,
    signal?: AbortSignal,
    after?: string
  ): Promise<GetMessagesResponse> {
    try {
      const offset = (page - 1) * limit;

      const queryParams: Record<string, unknown> = { limit };
      let mode: 'after' | 'before' | 'offset';
      if (after) {
        queryParams.after = after;
        mode = 'after';
      } else if (cursor) {
        queryParams.before = cursor;
        mode = 'before';
      } else {
        queryParams.offset = offset;
        mode = 'offset';
      }

      // La clé d'annulation inclut le MODE de lecture. Scopée à la seule
      // conversation, elle faisait s'annuler mutuellement les deux lectures
      // légitimement concurrentes d'une conversation ouverte — la pagination
      // (offset/before) et le rattrapage avant (after) — celle qui perdait la
      // course remontait `REQUEST_CANCELLED` et ses messages disparaissaient.
      const requestKey = `messages-${conversationId}-${mode}`;
      const controller = this.createRequestController(requestKey);

      if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      const response = await apiService.get<{
        success: boolean;
        data: unknown[];
        pagination?: PaginationMeta;
        cursorPagination?: CursorPaginationMeta;
        meta?: { userLanguage?: string };
      }>(
        API_ENDPOINTS.conversations.byIdMessages(conversationId),
        queryParams,
        { signal: controller.signal }
      );

      this.pendingRequests.delete(requestKey);

      if (!response.data?.success || !Array.isArray(response.data?.data)) {
        logger.warn('[Messages]', 'Structure de réponse inattendue', { data: response.data });
        return MessagesService.EMPTY_MESSAGES_RESPONSE;
      }

      const transformedMessages = response.data.data.map(msg =>
        transformersService.transformMessageData(msg)
      );

      const pagination = response.data.pagination;
      const cursorPagination = response.data.cursorPagination;

      return {
        messages: transformedMessages,
        total: pagination?.total ?? transformedMessages.length,
        hasMore: cursorPagination?.hasMore ?? pagination?.hasMore ?? false,
        pagination,
        cursorPagination,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('REQUEST_CANCELLED');
      }

      // Un échec réseau (401/500/timeout) n'est PAS une liste vide : le
      // rendre comme telle enregistre un succès React Query à zéro message,
      // qui ne réessaie jamais (`retry` ne voit aucune erreur) et se fige
      // derrière `staleTime: Infinity`, écrasant silencieusement le cache
      // jusqu'au prochain focus. L'erreur est propagée pour que la requête
      // passe en état `error` — React Query retry ensuite selon sa politique
      // globale (query-client.ts) et conserve la dernière page connue.
      logger.error('[Messages]', 'Erreur lors du chargement des messages', { error });
      throw error;
    }
  }

  /**
   * Envoyer un message dans une conversation
   */
  async sendMessage(conversationId: string, data: SendMessageRequest): Promise<Message> {
    const response = await apiService.post<{ success: boolean; data: Message }>(
      API_ENDPOINTS.conversations.byIdMessages(conversationId),
      data
    );

    if (!response.data?.data) {
      throw new Error('Erreur lors de l\'envoi du message');
    }

    return response.data.data;
  }

  /**
   * Marquer une conversation comme lue.
   *
   * `messageIds` porte les messages RÉELLEMENT affichés. Sans eux, le gateway
   * retombe sur son chemin historique par fenêtre temporelle, qui déclare lus
   * des messages jamais montrés — ouvrir une conversation à 200 non-lus les
   * marquait tous lus.
   *
   * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
   */
  async markAsRead(
    conversationId: string,
    messageIds?: readonly string[],
    /**
     * Version linguistique réellement affichée pour chacun de ces messages.
     * Absente pour un appelant qui ne la connaît pas — mieux vaut ne rien
     * déclarer qu'attribuer au lecteur une langue qu'il n'a pas vue.
     */
    consumedLanguages?: ReadonlyMap<string, string | null>
  ): Promise<void> {
    const url = API_ENDPOINTS.conversations.byConversationIdMarkAsRead(conversationId);

    // Les messages en cours d'envoi portent un `cid_<uuid>` et non un ObjectId.
    // En laisser passer un ferait rejeter TOUT le lot en 400, donc perdre les
    // lectures réelles qui l'accompagnaient.
    const serverIds = (messageIds ?? []).filter(id => SERVER_MESSAGE_ID.test(id));

    if (serverIds.length === 0) {
      // Un corps `{messageIds: []}` signifierait « rien n'a été affiché » et
      // ferait travailler le serveur pour rien. L'absence de corps conserve le
      // repli historique, seul comportement sûr pour un appel non informé.
      await apiService.post(url);
      return;
    }

    // Le serveur plafonne à 200. On garde les plus récents : ce sont ceux que
    // l'utilisateur vient de voir.
    const reported = serverIds.slice(-MARK_READ_BATCH_LIMIT);

    // Les langues sont restreintes au lot RÉELLEMENT envoyé : déclarer la
    // langue d'un message écarté par le plafond ferait rejeter le corps entier
    // (le serveur n'accepte que des identifiants du lot).
    const languages = consumedLanguages
      ? splitConsumedLanguages(
          new Map(reported.map(id => [id, consumedLanguages.get(id) ?? null]))
        )
      : {};

    await apiService.post(url, { messageIds: reported, ...languages });
  }

  /**
   * Marquer les messages d'une conversation comme reçus (delivered)
   */
  async markAsReceived(conversationId: string): Promise<void> {
    await apiService.post(API_ENDPOINTS.conversations.byConversationIdMarkAsReceived(conversationId));
  }

  /**
   * Récupérer les statuts de lecture batch pour plusieurs messages
   */
  async getReadStatuses(conversationId: string, messageIds: string[]): Promise<Record<string, { totalMembers: number; receivedCount: number; readCount: number }>> {
    const response = await apiService.get<{
      success: boolean;
      data: Record<string, { totalMembers: number; receivedCount: number; readCount: number }>;
    }>(API_ENDPOINTS.conversations.byConversationIdReadStatuses(conversationId), { messageIds: messageIds.join(',') });

    return response.data?.data ?? {};
  }

  /**
   * Récupérer les détails de statut d'un message (qui a lu, reçu, pas vu)
   */
  async getMessageStatusDetails(messageId: string, options: {
    offset?: number;
    limit?: number;
    filter?: 'all' | 'delivered' | 'read' | 'unread';
  } = {}): Promise<{
    statuses: Array<{
      participantId: string;
      displayName: string;
      avatar?: string | null;
      deliveredAt: string | null;
      receivedAt: string | null;
      readAt: string | null;
      readDevice?: string | null;
    }>;
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }> {
    const response = await apiService.get<{
      success: boolean;
      data: Array<{
        participantId: string;
        displayName: string;
        avatar?: string | null;
        deliveredAt: string | null;
        receivedAt: string | null;
        readAt: string | null;
        readDevice?: string | null;
      }>;
      pagination: { total: number; limit: number; offset: number; hasMore: boolean };
    }>(API_ENDPOINTS.messages.byMessageIdStatusDetails(messageId), {
      offset: options.offset ?? 0,
      limit: options.limit ?? 50,
      filter: options.filter ?? 'all',
    });

    return {
      statuses: Array.isArray(response.data?.data) ? response.data.data : [],
      pagination: response.data?.pagination ?? { total: 0, limit: 50, offset: 0, hasMore: false },
    };
  }

  /**
   * Marquer tous les messages d'une conversation comme lus (legacy endpoint)
   */
  async markConversationAsRead(conversationId: string): Promise<MarkAsReadResponse> {
    const requestKey = `mark-read-${conversationId}`;
    const controller = this.createRequestController(requestKey);

    try {
      const response = await apiService.post<MarkAsReadResponse>(
        API_ENDPOINTS.conversations.byIdMarkRead(conversationId),
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
