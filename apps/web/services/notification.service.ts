/**
 * NotificationService - Service API pour les notifications
 * Gère les appels API avec retry logic et gestion d'erreurs
 *
 * IMPORTANT: Le backend retourne déjà la structure correcte,
 * pas besoin de mapping complexe
 */

import { apiService } from './api.service';
import type { ApiResponse } from '@meeshy/shared/types';
import type {
  Notification,
  NotificationPaginatedResponse,
  NotificationQueryOptions,
  NotificationCounts,
} from '@/types/notification';

/**
 * Configuration du service
 */
const SERVICE_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  TIMEOUT: 10000,
};

/**
 * Helper pour attendre avec un délai
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cet échec peut-il donner un autre résultat si on le rejoue ?
 *
 * `withRetry` rejouait sur N'IMPORTE quelle erreur. Un `GET /notifications`
 * répondant 401 partait donc quatre fois — constaté en production le
 * 2026-08-18 : quatre 401 identiques dans la console, et sept secondes de
 * backoff avant que l'erreur ne remonte.
 *
 * Rejouer un 401 ne peut pas aboutir, et surtout : `ApiService.request` a DÉJÀ
 * tenté le rafraîchissement du jeton avant de laisser remonter ce 401 (il ne
 * jette `TOKEN_EXPIRED` qu'après échec du refresh). Le rejeu du service
 * relançait donc trois cycles complets — nouvelle requête ET nouvelle
 * tentative de refresh — pour refaire ce qui venait d'échouer.
 *
 * Deux couches de rejeu existaient, une seule était gardée : le `retry` du
 * QueryClient exclut bien 401/403/404, mais la couche interne avalait l'échec
 * avant qu'il ne l'atteigne. Une garde qu'on court-circuite ne garde rien.
 *
 * On rejoue donc ce qui PEUT changer d'avis : coupure réseau (aucun statut),
 * 5xx, et 429 — seule exception 4xx, parce que le serveur y dit explicitement
 * « plus tard » au lieu de refuser sur le fond.
 */
export function shouldRetryNotificationFailure(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status !== 'number') return true;

  if (status === 429) return true;
  return status < 400 || status >= 500;
}

/**
 * Helper pour retry avec backoff exponentiel — bornée aux échecs REJOUABLES.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = SERVICE_CONFIG.MAX_RETRIES,
  retryDelay = SERVICE_CONFIG.RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0 || !shouldRetryNotificationFailure(error)) {
      throw error;
    }

    await delay(retryDelay);

    return withRetry(fn, retries - 1, retryDelay * 2);
  }
}

/**
 * Parse une notification depuis l'API
 *
 * SIMPLIFIÉ: Le backend retourne déjà la bonne structure.
 * On parse juste les dates.
 */
function parseNotification(raw: any): Notification {
  // Helper pour parser une date de manière robuste
  const parseDate = (dateValue: any): Date | null => {
    if (!dateValue) {
      return null;
    }

    try {
      const date = new Date(dateValue);
      const isValid = !isNaN(date.getTime());
      return isValid ? date : null;
    } catch (error) {
      return null;
    }
  };

  // Le backend envoie les données dans la structure state
  // raw.state = { isRead, readAt, createdAt, expiresAt }
  const state = raw.state || {};

  // Parser les dates - PAS DE FALLBACK new Date() !
  const createdAt = parseDate(state.createdAt);
  const readAt = parseDate(state.readAt);
  const expiresAt = parseDate(state.expiresAt);

  return {
    id: raw.id,
    userId: raw.userId,
    type: raw.type,
    priority: raw.priority || 'normal',
    content: raw.content,

    actor: raw.actor,
    context: raw.context || {},
    metadata: raw.metadata || {},

    state: {
      isRead: state.isRead ?? false,
      readAt,
      createdAt: createdAt!, // Force non-null (on gère dans l'UI)
      expiresAt: expiresAt ?? undefined,
    },

    delivery: raw.delivery || { emailSent: false, pushSent: false },
  };
}

/**
 * NotificationService - Service principal pour les notifications
 */
export const NotificationService = {
  /**
   * Récupère les notifications avec pagination et filtres
   */
  async fetchNotifications(
    options: NotificationQueryOptions = {}
  ): Promise<ApiResponse<NotificationPaginatedResponse>> {
    const { offset = 0, cursor, limit = 50, types, isRead } = options;

    return withRetry(async () => {
      const params = new URLSearchParams();
      // Le curseur REMPLACE le rang, il ne l'accompagne pas : envoyer les deux
      // laisserait le serveur arbitrer entre une ancre et un rang périmé.
      if (cursor) {
        params.set('cursor', cursor);
      } else {
        params.set('offset', offset.toString());
      }
      params.set('limit', limit.toString());

      // L'onglet est envoyé au SERVEUR, pas appliqué aux pages déjà chargées :
      // filtré côté client, « aucune mention » ne veut dire que « aucune mention
      // parmi les vingt dernières notifications », et rien ne va chercher les
      // autres. Une liste vide n'envoie rien — l'onglet « tout ».
      if (types && types.length > 0) {
        params.set('types', types.join(','));
      }

      if (typeof isRead === 'boolean') {
        params.set('unreadOnly', (!isRead).toString());
      }

      const response = await apiService.get<{
        success: boolean;
        data: any[];
        pagination: {
          offset: number;
          limit: number;
          total: number;
          hasMore: boolean;
        };
        unreadCount: number;
      }>(`/notifications?${params.toString()}`);

      if (response.data?.data) {
        const notifications: Notification[] = response.data.data.map(parseNotification);

        return {
          ...response,
          data: {
            notifications,
            pagination: response.data.pagination,
            unreadCount: response.data.unreadCount ?? 0,
          },
        };
      }

      return {
        ...response,
        data: {
          notifications: [],
          pagination: {
            offset: 0,
            limit: 50,
            total: 0,
            hasMore: false,
          },
          unreadCount: 0,
        },
      };
    });
  },

  /**
   * Récupère le nombre de notifications non lues
   */
  async getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
    return withRetry(async () => {
      return apiService.get<{ success: boolean; count: number }>('/notifications/unread-count');
    });
  },

  /**
   * Marque une notification comme lue
   */
  async markAsRead(notificationId: string): Promise<ApiResponse<{ data: Notification }>> {
    return withRetry(async () => {
      const response = await apiService.post<{ success: boolean; data: any }>(
        `/notifications/${notificationId}/read`
      );

      if (response.data?.data) {
        return {
          ...response,
          data: {
            data: parseNotification(response.data.data),
          },
        };
      }

      return response as any;
    });
  },

  /**
   * Marque toutes les notifications comme lues
   */
  async markAllAsRead(): Promise<ApiResponse<{ count: number }>> {
    return withRetry(async () => {
      return apiService.post<{ success: boolean; count: number }>('/notifications/read-all');
    });
  },

  /**
   * Marque toutes les notifications d'une conversation comme lues
   * (contenu consommé à l'ouverture de la conversation).
   */
  async markConversationRead(conversationId: string): Promise<ApiResponse<{ count: number }>> {
    return withRetry(async () => {
      return apiService.post<{ success: boolean; count: number }>(
        `/notifications/conversation/${conversationId}/read`
      );
    });
  },

  /**
   * Marque toutes les notifications d'un post (story, réel, statut, post feed)
   * comme lues — commentaires et réactions du post inclus (portée serveur
   * `context.postId`). Contrairement à POST /posts/:id/view (borné à la
   * première vue), cette route couvre les notifications arrivées après coup.
   */
  async markPostRead(postId: string): Promise<ApiResponse<{ count: number }>> {
    return withRetry(async () => {
      return apiService.post<{ success: boolean; count: number }>(
        `/notifications/post/${postId}/read`
      );
    });
  },

  /**
   * Supprime une notification
   */
  async deleteNotification(notificationId: string): Promise<ApiResponse<void>> {
    return withRetry(async () => {
      return apiService.delete(`/notifications/${notificationId}`);
    });
  },

  /**
   * Supprime toutes les notifications lues
   */
  async deleteAllRead(): Promise<ApiResponse<void>> {
    return withRetry(async () => {
      return apiService.delete('/notifications/read');
    });
  },

  /**
   * Récupère les compteurs de notifications
   */
  /**
   * Les totaux de l'inbox ENTIÈRE, par type.
   *
   * Cette méthode rendait `total = unread = /notifications/unread-count` : deux
   * questions différentes servies par le même chiffre, et un `byType` déclaré
   * dans le type sans que rien ne le produise. Les onglets de la cloche
   * comptaient donc, faute de mieux, les pages déjà chargées — le même mensonge
   * que le filtre qu'ils commandent.
   */
  async getCounts(): Promise<ApiResponse<NotificationCounts>> {
    return withRetry(async () => {
      const response = await apiService.get<{
        success: boolean;
        data?: NotificationCounts;
      }>('/notifications/counts');

      const counts = response.data?.data;

      return {
        ...response,
        data: {
          total: counts?.total ?? 0,
          unread: counts?.unread ?? 0,
          byType: counts?.byType ?? {},
        },
      };
    });
  },

  /**
   * Récupère les préférences de notifications.
   *
   * Migré une seconde fois (#4181) : de l'alias `/me/preferences/notification`
   * (déprécié, RFC 9745 — reste servi, mais compte pour le compteur d'adoption
   * de #4275) vers la route UNIQUE `/me/preferences`. `?categories=` cible la
   * catégorie de ce service, et la réponse la range sous son NOM
   * (`{ notification: {...} }`) — déballée ici pour que ce service garde EXACTEMENT
   * le même contrat de sortie qu'avant : `response.data` reste le document,
   * jamais l'enveloppe multi-catégories.
   */
  async getPreferences(): Promise<ApiResponse<any>> {
    return withRetry(async () => {
      const response = await apiService.get<{ notification?: unknown }>(
        '/api/v1/me/preferences',
        { categories: 'notification' }
      );
      return { ...response, data: response.data?.notification };
    });
  },

  /**
   * Met à jour les préférences de notifications — route unique de #4181.
   * `mode=merge` (défaut) : une clé absente du corps garde sa valeur stockée,
   * jamais remise à son `default()` Zod. Même déballage qu'au-dessus.
   */
  async updatePreferences(preferences: any): Promise<ApiResponse<any>> {
    return withRetry(async () => {
      const response = await apiService.patch<{ notification?: unknown }>(
        '/api/v1/me/preferences',
        { notification: preferences }
      );
      return { ...response, data: response.data?.notification };
    });
  },
};

/**
 * MIGRATION NOTE:
 * LocalNotificationService a été supprimé - utiliser maintenant:
 * - useNotificationsManagerRQ (React Query + Socket.IO) pour les hooks
 * - NotificationService (API calls) pour les appels directs
 * - notificationSocketIO (singleton) pour les événements temps réel
 */
