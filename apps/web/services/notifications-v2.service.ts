/**
 * Service API pour les notifications v2
 * Gère les appels API avec retry logic et gestion d'erreurs
 */

import { apiService } from './api.service';
import type { ApiResponse } from '@meeshy/shared/types';
import type {
  NotificationV2,
  NotificationFilters,
  NotificationPaginationOptions,
  NotificationPaginatedResponse,
  NotificationCounts,
  NotificationStats,
  NotificationPreferences
} from '@/types/notification-v2';

/**
 * Configuration du service
 */
const SERVICE_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  TIMEOUT: 10000
};

/**
 * Helper pour attendre avec un délai
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

    console.warn(`[NotificationServiceV2] Retry attempt (${SERVICE_CONFIG.MAX_RETRIES - retries + 1}/${SERVICE_CONFIG.MAX_RETRIES})`);
    await delay(retryDelay);

    return withRetry(fn, retries - 1, retryDelay * 2);
  }
}

/**
 * Service API pour les notifications v2
 */
export const notificationServiceV2 = {
  /**
   * Récupère les notifications avec pagination et filtres
   */
  async fetchNotifications(
    options: Partial<NotificationFilters & NotificationPaginationOptions> = {}
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
      sortOrder = 'desc'
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
        params.set('isRead', isRead.toString());
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
        data: {
          notifications: any[];
          pagination: NotificationPaginatedResponse['pagination'];
        };
      }>(`/notifications?${params.toString()}`);

      // Parser les notifications si les données existent
      // Note: apiService.get wraps the backend response in { data: <backend_response> }
      // Backend returns { success: true, data: { notifications, pagination } }
      // So we need to access response.data.data.notifications
      if (response.data?.data?.notifications) {
        const notifications: NotificationV2[] = response.data.data.notifications.map(parseNotification);

        return {
          ...response,
          data: {
            notifications,
            pagination: response.data.data.pagination
          }
        };
      }

      // Retourner une structure valide si pas de données
      return {
        ...response,
        data: {
          notifications: [],
          pagination: {
            offset: 0,
            limit: 50,
            total: 0,
            hasMore: false
          }
        }
      };
    });
  },

  /**
   * Récupère le compteur de notifications non lues
   */
  async getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
    return withRetry(async () => {
      return apiService.get<{ count: number }>('/notifications/unread/count');
    });
  },

  /**
   * Récupère les compteurs détaillés
   */
  async getCounts(): Promise<ApiResponse<{ counts: NotificationCounts }>> {
    return withRetry(async () => {
      return apiService.get<{ counts: NotificationCounts }>('/notifications/counts');
    });
  },

  /**
   * Récupère les statistiques des notifications
   */
  async getStats(): Promise<ApiResponse<{ stats: NotificationStats }>> {
    return withRetry(async () => {
      return apiService.get<{ stats: NotificationStats }>('/notifications/stats');
    });
  },

  /**
   * Marque une notification comme lue
   */
  async markAsRead(notificationId: string): Promise<ApiResponse<{ success: boolean }>> {
    return withRetry(async () => {
      return apiService.patch<{ success: boolean }>(
        `/notifications/${notificationId}/read`
      );
    });
  },

  /**
   * Marque toutes les notifications comme lues
   */
  async markAllAsRead(): Promise<ApiResponse<{ success: boolean; count: number }>> {
    return withRetry(async () => {
      return apiService.patch<{ success: boolean; count: number }>(
        '/notifications/read-all'
      );
    });
  },

  /**
   * Supprime une notification
   */
  async deleteNotification(notificationId: string): Promise<ApiResponse<{ success: boolean }>> {
    return withRetry(async () => {
      return apiService.delete<{ success: boolean }>(
        `/notifications/${notificationId}`
      );
    });
  },

  /**
   * Supprime toutes les notifications lues
   */
  async deleteAllRead(): Promise<ApiResponse<{ success: boolean; count: number }>> {
    return withRetry(async () => {
      return apiService.delete<{ success: boolean; count: number }>(
        '/notifications/read'
      );
    });
  },

  /**
   * Récupère les préférences de notifications
   */
  async getPreferences(): Promise<ApiResponse<{ preferences: NotificationPreferences }>> {
    return withRetry(async () => {
      return apiService.get<{ preferences: NotificationPreferences }>(
        '/notifications/preferences'
      );
    });
  },

  /**
   * Met à jour les préférences de notifications
   */
  async updatePreferences(
    preferences: Partial<NotificationPreferences>
  ): Promise<ApiResponse<{ success: boolean; preferences: NotificationPreferences }>> {
    return withRetry(async () => {
      return apiService.post<{ success: boolean; preferences: NotificationPreferences }>(
        '/notifications/preferences',
        preferences
      );
    });
  },

  /**
   * Mute une conversation
   */
  async muteConversation(conversationId: string): Promise<ApiResponse<{ success: boolean }>> {
    return withRetry(async () => {
      return apiService.post<{ success: boolean }>(
        '/notifications/mute',
        { conversationId }
      );
    });
  },

  /**
   * Unmute une conversation
   */
  async unmuteConversation(conversationId: string): Promise<ApiResponse<{ success: boolean }>> {
    return withRetry(async () => {
      return apiService.post<{ success: boolean }>(
        '/notifications/unmute',
        { conversationId }
      );
    });
  },

  /**
   * Envoie une notification de test (pour développement)
   */
  async sendTestNotification(
    type?: string
  ): Promise<ApiResponse<{ success: boolean; notification: NotificationV2 }>> {
    return apiService.post<{ success: boolean; notification: any }>(
      '/notifications/test',
      { type }
    ).then(response => {
      // Parser la notification si les données existent
      if (response.data?.notification) {
        return {
          ...response,
          data: {
            success: response.data.success || true,
            notification: parseNotification(response.data.notification)
          }
        };
      }
      return response as ApiResponse<{ success: boolean; notification: NotificationV2 }>;
    });
  }
};

/**
 * Parse une notification brute depuis l'API
 */
function parseNotification(raw: any): NotificationV2 {
  // Parser le champ data s'il est en JSON string
  let parsedData = raw.data;
  if (typeof raw.data === 'string') {
    try {
      parsedData = JSON.parse(raw.data);
    } catch (error) {
      console.error('[NotificationServiceV2] Failed to parse notification data:', error);
      parsedData = {};
    }
  }

  // Construire la notification typée
  const notification: NotificationV2 = {
    id: raw.id,
    userId: raw.userId,
    type: raw.type,
    title: raw.title,
    content: raw.content || raw.message || '',
    priority: raw.priority || 'normal',
    isRead: raw.isRead || false,
    readAt: raw.readAt ? new Date(raw.readAt) : undefined,
    createdAt: new Date(raw.createdAt),
    expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : undefined,

    // Sender
    sender: raw.senderId ? {
      id: raw.senderId,
      username: raw.senderUsername || 'Unknown',
      avatar: raw.senderAvatar,
      displayName: raw.senderDisplayName,
      firstName: raw.senderFirstName,
      lastName: raw.senderLastName
    } : undefined,

    // Message preview
    messagePreview: raw.messagePreview,

    // Context
    context: {
      conversationId: raw.conversationId || parsedData?.conversationId,
      conversationTitle: parsedData?.conversationTitle,
      conversationType: parsedData?.conversationType,
      messageId: raw.messageId || parsedData?.messageId,
      originalMessageId: parsedData?.originalMessageId,
      callSessionId: raw.callSessionId || parsedData?.callSessionId,
      friendRequestId: raw.friendRequestId || parsedData?.friendRequestId,
      reactionId: raw.reactionId || parsedData?.reactionId
    },

    // Metadata
    metadata: {
      attachments: parsedData?.attachments,
      reactionEmoji: parsedData?.emoji || parsedData?.reactionEmoji,
      memberCount: parsedData?.memberCount,
      action: parsedData?.action,
      joinMethod: parsedData?.joinMethod,
      systemType: parsedData?.systemType,
      isMember: parsedData?.isMember
    },

    // Raw data for backward compatibility
    data: parsedData
  };

  return notification;
}

export default notificationServiceV2;
