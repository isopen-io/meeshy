/**
 * Hook pour la gestion des notifications
 * Centralise toutes les notifications et synchronise les compteurs
 */

import { useState, useEffect, useCallback } from 'react';
import { authManager } from '@/services/auth-manager.service';
import { toast } from 'sonner';
import { notificationService, type Notification, type NotificationCounts } from '@/services/notification.service';
import { useAuth } from './use-auth';

export interface UseNotificationsReturn {
  // Notifications
  notifications: Notification[];
  unreadNotifications: Notification[];
  
  // Compteurs
  counts: NotificationCounts;
  unreadCount: number;
  totalCount: number;
  
  // Actions
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  removeNotification: (notificationId: string) => void;
  clearAll: () => void;
  
  // État de connexion
  isConnected: boolean;
  
  // Actions de notification
  showToast: (notification: Notification) => void;
}

export const useNotifications = (): UseNotificationsReturn => {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const [counts, setCounts] = useState<NotificationCounts>({
    total: 0,
    unread: 0,
    byType: {
      message: 0,
      system: 0,
      user_action: 0,
      conversation: 0,
      translation: 0
    }
  });
  const [isConnected, setIsConnected] = useState(false);

  // Initialiser le service de notifications
  useEffect(() => {
    if (isAuthenticated && user) {
      const token = authManager.getAuthToken();
      if (token) {
        
        notificationService.initialize({
          token,
          userId: user.id,
          onConnect: () => {
            setIsConnected(true);
          },
          onDisconnect: () => {
            setIsConnected(false);
          },
          onError: (error) => {
            console.error('Erreur service de notifications:', error);
            setIsConnected(false);
          },
          onNotificationReceived: (notification) => {
            updateNotifications();
            // Toast désactivé - le système de notifications v2 gère les notifications métier
            // showToast(notification);
          },
          onCountsUpdated: (newCounts) => {
            setCounts(newCounts);
          }
        });
      }
    }

    return () => {
      notificationService.disconnect();
      setIsConnected(false);
    };
  }, [isAuthenticated, user]);

  // Mettre à jour les notifications
  const updateNotifications = useCallback(() => {
    const allNotifications = notificationService.getNotifications();
    const unread = notificationService.getUnreadNotifications();
    
    setNotifications(allNotifications);
    setUnreadNotifications(unread);
  }, []);

  // Marquer une notification comme lue
  const markAsRead = useCallback(async (notificationId: string) => {
    await notificationService.markAsRead(notificationId);
    updateNotifications();
  }, [updateNotifications]);

  // Marquer toutes les notifications comme lues
  const markAllAsRead = useCallback(async () => {
    await notificationService.markAllAsRead();
    updateNotifications();
  }, [updateNotifications]);

  // Supprimer une notification
  const removeNotification = useCallback((notificationId: string) => {
    notificationService.removeNotification(notificationId);
    updateNotifications();
  }, [updateNotifications]);

  // Supprimer toutes les notifications
  const clearAll = useCallback(() => {
    notificationService.clearAll();
    updateNotifications();
  }, [updateNotifications]);

  // DÉSACTIVÉ : Les toasts pour les notifications métier ne sont plus utilisés
  // Le système de notifications v2 (NotificationBell) affiche déjà les notifications
  const showToast = useCallback((notification: Notification) => {
    // Toasts désactivés - utiliser uniquement le système de notifications v2
    return;

    const getToastIcon = (type: string) => {
      switch (type) {
        case 'message':
        case 'new_message':
          return '💬';
        case 'system':
        case 'missed_call':
          return '🔔';
        case 'conversation':
        case 'new_conversation':
          return '👥';
        case 'translation':
          return '🌍';
        default:
          return '📢';
      }
    };

    const getToastType = (type: string) => {
      switch (type) {
        case 'message':
        case 'new_message':
          return 'success';
        case 'system':
        case 'missed_call':
          return 'info';
        case 'conversation':
        case 'new_conversation':
          return 'info';
        case 'translation':
          return 'success';
        default:
          return 'info';
      }
    };

    const toastType = getToastType(notification.type);
    const icon = getToastIcon(notification.type);
    const duration = notification.translations ? 6000 : 4000;

    const toastConfig: any = {
      description: notification.message,
      duration,
    };

    // Ajouter une action si c'est une notification de message
    if (notification.type === 'message' && notification.conversationId) {
      toastConfig.action = {
        label: 'Voir',
        onClick: () => {
          window.location.href = `/chat/${notification.conversationId}`;
        },
      };
    }

    toast[toastType](`${icon} ${notification.title}`, toastConfig);
  }, []);

  // Mettre à jour les notifications au montage
  useEffect(() => {
    updateNotifications();
    setCounts(notificationService.getCounts());
  }, [updateNotifications]);

  return {
    notifications,
    unreadNotifications,
    counts,
    unreadCount: counts.unread,
    totalCount: counts.total,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    isConnected,
    showToast
  };
};
