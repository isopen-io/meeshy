import { apiService, ApiResponse } from './api.service';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface NotificationPreferences {
  userId: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  types: Record<string, boolean>;
}

export interface NotificationsResponse {
  notifications: Notification[];
  count: number;
  timestamp: string;
}

export interface NotificationStats {
  totalSent: number;
  totalUnread: number;
  byType: Record<string, number>;
  performance: {
    averageDeliveryTime: number;
    successRate: number;
  };
}

/**
 * Service pour gérer les notifications utilisateur
 */
export const notificationsService = {
  /**
   * Récupère les notifications de l'utilisateur connecté
   */
  async getNotifications(): Promise<ApiResponse<NotificationsResponse>> {
    try {
      const response = await apiService.get<NotificationsResponse>('/notifications');
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des notifications:', error);
      throw error;
    }
  },

  /**
   * Marque une notification comme lue
   */
  async markAsRead(notificationId: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    try {
      const response = await apiService.delete<{ success: boolean; message: string }>(`/notifications/${notificationId}`);
      return response;
    } catch (error) {
      console.error('Erreur lors du marquage de la notification:', error);
      throw error;
    }
  },

  /**
   * Marque toutes les notifications comme lues
   */
  async markAllAsRead(): Promise<ApiResponse<{ success: boolean; message: string; count: number }>> {
    try {
      const response = await apiService.delete<{ success: boolean; message: string; count: number }>('/notifications');
      return response;
    } catch (error) {
      console.error('Erreur lors du marquage des notifications:', error);
      throw error;
    }
  },

  /**
   * Récupère les préférences de notification
   */
  async getPreferences(): Promise<ApiResponse<{ preferences: NotificationPreferences; timestamp: string }>> {
    try {
      const response = await apiService.get<{ preferences: NotificationPreferences; timestamp: string }>('/notifications/preferences');
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des préférences:', error);
      throw error;
    }
  },

  /**
   * Met à jour les préférences de notification
   */
  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<ApiResponse<{ success: boolean; preferences: NotificationPreferences; message: string }>> {
    try {
      const response = await apiService.post<{ success: boolean; preferences: NotificationPreferences; message: string }>('/notifications/preferences', preferences);
      return response;
    } catch (error) {
      console.error('Erreur lors de la mise à jour des préférences:', error);
      throw error;
    }
  },

  /**
   * Envoie une notification test (pour développement)
   */
  async sendTestNotification(): Promise<ApiResponse<{ success: boolean; notification: Notification; message: string }>> {
    try {
      const response = await apiService.post<{ success: boolean; notification: Notification; message: string }>('/notifications/test');
      return response;
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la notification test:', error);
      throw error;
    }
  },

  /**
   * Récupère les statistiques des notifications
   */
  async getStats(): Promise<ApiResponse<{ stats: NotificationStats; timestamp: string }>> {
    try {
      const response = await apiService.get<{ stats: NotificationStats; timestamp: string }>('/notifications/stats');
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  },
};

export default notificationsService;
