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
  // Support pour les deux formats: state à la racine OU données à la racine
  // Le backend peut envoyer soit raw.state.createdAt soit raw.createdAt
  const stateData = raw.state || {};

  // Helper pour parser une date de manière robuste
  const parseDate = (dateValue: any): Date | null => {
    if (!dateValue) return null;
    try {
      const date = new Date(dateValue);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };

  // Essayer de trouver createdAt dans différents endroits
  const createdAtValue = stateData.createdAt || raw.createdAt || raw.created_at || raw.createdDate;
  const createdAtDate = parseDate(createdAtValue);

  // Debug: Log la structure complète reçue du backend
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 [parseNotification] Raw notification:', {
      id: raw.id,
      hasState: !!raw.state,
      stateCreatedAt: stateData.createdAt,
      rawCreatedAt: raw.createdAt,
      raw_created_at: raw.created_at,
      parsedCreatedAt: createdAtDate?.toISOString(),
      stateIsRead: stateData.isRead,
      rawIsRead: raw.isRead,
      createdAtValue: createdAtValue,
      typeofCreatedAtValue: typeof createdAtValue,
      fullRawKeys: Object.keys(raw),
    });

    // Log l'objet complet pour la première notification
    if (Math.random() < 0.3) {
      console.log('📦 Full raw object:', JSON.stringify(raw, null, 2));
    }
  }

  return {
    id: raw.id,
    userId: raw.userId,
    type: raw.type,
    priority: raw.priority || 'normal',
    content: raw.content,

    // Groupes déjà structurés par le backend
    actor: raw.actor,
    context: raw.context || {},
    metadata: raw.metadata || {},

    // State avec parsing des dates
    state: {
      isRead: stateData.isRead ?? raw.isRead ?? false,
      readAt: parseDate(stateData.readAt || raw.readAt),
      createdAt: createdAtDate || new Date(),
      expiresAt: parseDate(stateData.expiresAt || raw.expiresAt) || undefined,
    },

    // Delivery
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

      // Debug: Log la réponse brute de l'API
      if (process.env.NODE_ENV === 'development' && response.data?.data) {
        console.log('🌐 [API Response] First notification from backend:',
          response.data.data[0] ? JSON.stringify(response.data.data[0], null, 2) : 'No notifications'
        );
      }

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
