/**
 * NotificationService - Service API pour les notifications
 * Gère les appels API avec retry logic et gestion d'erreurs
 *
 * Types importés de @meeshy/shared pour cohérence avec le backend
 */

import { apiService } from './api.service';
import type { ApiResponse } from '@meeshy/shared/types';
import type {
  Notification,
  NotificationFilters,
  NotificationPaginationOptions,
  NotificationPaginatedResponse,
  NotificationCounts,
  NotificationStats,
  NotificationPreferences
} from '@/types/notification';

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

    console.warn(`[NotificationService] Retry attempt (${SERVICE_CONFIG.MAX_RETRIES - retries + 1}/${SERVICE_CONFIG.MAX_RETRIES})`);
    await delay(retryDelay);

    return withRetry(fn, retries - 1, retryDelay * 2);
  }
}

/**
 * Parse une notification brute depuis l'API
 */
function parseNotification(raw: any): Notification {
  // Parser le champ data s'il est en JSON string
  let parsedData = raw.data;
  if (typeof raw.data === 'string') {
    try {
      parsedData = JSON.parse(raw.data);
    } catch (error) {
      console.error('[NotificationService] Failed to parse notification data:', error);
      parsedData = {};
    }
  }

  // Construire la notification typée
  const notification: Notification = {
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

    // Raw data
    data: parsedData
  };

  return notification;
}

/**
 * NotificationService - Service principal pour les notifications
 */
export const NotificationService = {
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

      if (response.data?.data?.notifications) {
        const notifications: Notification[] = response.data.data.notifications.map(parseNotification);

        return {
          ...response,
          data: {
            notifications,
            pagination: response.data.data.pagination
          }
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
   * Utilise le nouvel endpoint unifié /user-preferences/notifications
   */
  async getPreferences(): Promise<ApiResponse<{ preferences: NotificationPreferences }>> {
    return withRetry(async () => {
      const response = await apiService.get<{ success: boolean; data: NotificationPreferences }>(
        '/user-preferences/notifications'
      );
      // Adapter la réponse au format attendu
      if (response.data?.data) {
        return {
          ...response,
          data: { preferences: response.data.data }
        } as ApiResponse<{ preferences: NotificationPreferences }>;
      }
      return response as unknown as ApiResponse<{ preferences: NotificationPreferences }>;
    });
  },

  /**
   * Met à jour les préférences de notifications
   * Utilise le nouvel endpoint unifié /user-preferences/notifications
   */
  async updatePreferences(
    preferences: Partial<NotificationPreferences>
  ): Promise<ApiResponse<{ success: boolean; preferences: NotificationPreferences }>> {
    return withRetry(async () => {
      const response = await apiService.put<{ success: boolean; data: NotificationPreferences }>(
        '/user-preferences/notifications',
        preferences
      );
      // Adapter la réponse au format attendu
      if (response.data?.data) {
        return {
          ...response,
          data: { success: true, preferences: response.data.data }
        } as ApiResponse<{ success: boolean; preferences: NotificationPreferences }>;
      }
      return response as unknown as ApiResponse<{ success: boolean; preferences: NotificationPreferences }>;
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
  ): Promise<ApiResponse<{ success: boolean; notification: Notification }>> {
    return apiService.post<{ success: boolean; notification: any }>(
      '/notifications/test',
      { type }
    ).then(response => {
      if (response.data?.notification) {
        return {
          ...response,
          data: {
            success: response.data.success || true,
            notification: parseNotification(response.data.notification)
          }
        };
      }
      return response as ApiResponse<{ success: boolean; notification: Notification }>;
    });
  }
};

export default NotificationService;

// Re-export types for convenience
export type { Notification, NotificationCounts } from '@/types/notification';

/**
 * Notification service wrapper with local state management
 * Provides the interface expected by use-notifications.ts hook
 */
class NotificationServiceWrapper {
  private notifications: Notification[] = [];
  private counts: NotificationCounts = {
    total: 0,
    unread: 0,
    byType: {
      message: 0,
      system: 0,
      user_action: 0,
      conversation: 0,
      translation: 0
    }
  };
  private callbacks: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
    onNotificationReceived?: (notification: Notification) => void;
    onCountsUpdated?: (counts: NotificationCounts) => void;
  } = {};

  /**
   * Initialize the notification service
   */
  initialize(config: {
    token: string;
    userId: string;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
    onNotificationReceived?: (notification: Notification) => void;
    onCountsUpdated?: (counts: NotificationCounts) => void;
  }) {
    this.callbacks = config;
    // Simulate connection success
    setTimeout(() => {
      this.callbacks.onConnect?.();
    }, 100);
  }

  /**
   * Disconnect the service
   */
  disconnect() {
    this.callbacks.onDisconnect?.();
    this.callbacks = {};
  }

  /**
   * Get all notifications (local state)
   */
  getNotifications(): Notification[] {
    return this.notifications;
  }

  /**
   * Get unread notifications (local state)
   */
  getUnreadNotifications(): Notification[] {
    return this.notifications.filter(n => !n.isRead);
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.isRead = true;
      this.updateCounts();
    }
    // Also call API
    return NotificationService.markAsRead(notificationId);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead() {
    this.notifications.forEach(n => { n.isRead = true; });
    this.updateCounts();
    return NotificationService.markAllAsRead();
  }

  /**
   * Remove a notification from local state
   */
  removeNotification(notificationId: string) {
    this.notifications = this.notifications.filter(n => n.id !== notificationId);
    this.updateCounts();
  }

  /**
   * Clear all notifications from local state
   */
  clearAll() {
    this.notifications = [];
    this.updateCounts();
  }

  /**
   * Get notification counts
   */
  getCounts(): NotificationCounts {
    return this.counts;
  }

  /**
   * Update counts based on current notifications
   */
  private updateCounts() {
    const unread = this.notifications.filter(n => !n.isRead).length;
    this.counts = {
      total: this.notifications.length,
      unread,
      byType: {
        message: this.notifications.filter(n => n.type === 'message').length,
        system: this.notifications.filter(n => n.type === 'system').length,
        user_action: this.notifications.filter(n => n.type === 'user_action').length,
        conversation: this.notifications.filter(n => n.type === 'conversation').length,
        translation: this.notifications.filter(n => n.type === 'translation').length
      }
    };
    this.callbacks.onCountsUpdated?.(this.counts);
  }

  // Proxy to API methods
  fetchNotifications = NotificationService.fetchNotifications.bind(NotificationService);
  fetchUnreadCount = NotificationService.getUnreadCount.bind(NotificationService);
  fetchCounts = NotificationService.getCounts.bind(NotificationService);
  fetchStats = NotificationService.getStats.bind(NotificationService);
  fetchPreferences = NotificationService.getPreferences.bind(NotificationService);
  updatePreferences = NotificationService.updatePreferences.bind(NotificationService);
  deleteNotification = NotificationService.deleteNotification.bind(NotificationService);
  testNotification = NotificationService.sendTestNotification.bind(NotificationService);
}

// Alias for backwards compatibility (lowercase)
export const notificationService = new NotificationServiceWrapper();
