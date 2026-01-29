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
  NotificationFilters,
  NotificationPaginatedResponse,
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
 * Helper pour retry avec backoff exponentiel
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = SERVICE_CONFIG.MAX_RETRIES,
  retryDelay = SERVICE_CONFIG.RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      throw error;
    }

    console.warn(
      `[NotificationService] Retry attempt (${SERVICE_CONFIG.MAX_RETRIES - retries + 1}/${SERVICE_CONFIG.MAX_RETRIES})`
    );
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
  const parseDate = (dateValue: any, debugName: string): Date | null => {
    if (!dateValue) {
      console.log(`🔍 [parseDate] ${debugName} est null/undefined`);
      return null;
    }

    console.log(`🔍 [parseDate] ${debugName}:`, {
      value: dateValue,
      type: typeof dateValue,
      isString: typeof dateValue === 'string',
    });

    try {
      const date = new Date(dateValue);
      const isValid = !isNaN(date.getTime());

      console.log(`🔍 [parseDate] ${debugName} parsed:`, {
        parsedDate: date,
        isValid,
        toISOString: isValid ? date.toISOString() : 'N/A',
      });

      return isValid ? date : null;
    } catch (error) {
      console.error(`❌ [parseDate] ${debugName} erreur:`, error);
      return null;
    }
  };

  // Le backend envoie les données dans la structure state
  // raw.state = { isRead, readAt, createdAt, expiresAt }
  const state = raw.state || {};

  console.group(`📦 [parseNotification] ID: ${raw.id}`);
  console.log('Raw state:', state);
  console.log('state.createdAt:', state.createdAt);

  // Parser les dates - PAS DE FALLBACK new Date() !
  const createdAt = parseDate(state.createdAt, 'createdAt');
  const readAt = parseDate(state.readAt, 'readAt');
  const expiresAt = parseDate(state.expiresAt, 'expiresAt');

  console.log('Résultat parsing createdAt:', createdAt);
  console.groupEnd();

  // Debug: Log si createdAt est null après parsing
  if (!createdAt && process.env.NODE_ENV === 'development') {
    console.error('❌ [parseNotification] createdAt est null après parsing', {
      id: raw.id,
      stateCreatedAt: state.createdAt,
      typeofStateCreatedAt: typeof state.createdAt,
      rawState: JSON.stringify(raw.state),
    });
  }

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
      expiresAt,
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
    options: Partial<NotificationFilters> = {}
  ): Promise<ApiResponse<NotificationPaginatedResponse>> {
    const {
      offset = 0,
      limit = 50,
      type,
      isRead,
      priority,
      conversationId,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    return withRetry(async () => {
      const params = new URLSearchParams();
      params.set('offset', offset.toString());
      params.set('limit', limit.toString());
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      if (type && type !== 'all') {
        params.set('type', type);
      }

      if (typeof isRead === 'boolean') {
        params.set('unreadOnly', (!isRead).toString());
      }

      if (priority) {
        params.set('priority', priority);
      }

      if (conversationId) {
        params.set('conversationId', conversationId);
      }

      if (startDate) {
        params.set('startDate', startDate.toISOString());
      }

      if (endDate) {
        params.set('endDate', endDate.toISOString());
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
   * Supprime une notification
   */
  async deleteNotification(notificationId: string): Promise<ApiResponse<void>> {
    return withRetry(async () => {
      return apiService.delete(`/notifications/${notificationId}`);
    });
  },

  /**
   * Récupère les compteurs de notifications
   */
  async getCounts(): Promise<ApiResponse<NotificationCounts>> {
    return withRetry(async () => {
      const response = await apiService.get<{
        success: boolean;
        count: number;
      }>('/notifications/unread-count');

      if (response.data) {
        return {
          ...response,
          data: {
            total: response.data.count || 0,
            unread: response.data.count || 0,
          },
        };
      }

      return {
        ...response,
        data: {
          total: 0,
          unread: 0,
        },
      };
    });
  },

  /**
   * Récupère les préférences de notifications
   */
  async getPreferences(): Promise<ApiResponse<any>> {
    return withRetry(async () => {
      return apiService.get('/notifications/preferences');
    });
  },

  /**
   * Met à jour les préférences de notifications
   */
  async updatePreferences(preferences: any): Promise<ApiResponse<any>> {
    return withRetry(async () => {
      return apiService.patch('/notifications/preferences', preferences);
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
