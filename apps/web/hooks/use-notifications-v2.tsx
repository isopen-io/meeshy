/**
 * Hook custom pour les notifications v2
 * Utilise un singleton Socket.IO pour éviter les connexions multiples et les doublons
 */

'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores/auth-store';
import {
  useNotificationStoreV2,
  useNotificationsV2,
  useUnreadCountV2,
  useNotificationCountsV2,
  useNotificationActionsV2
} from '@/stores/notification-store-v2';
import type { NotificationV2 } from '@/types/notification-v2';
import { toast } from 'sonner';
import { notificationSocketIO } from '@/services/notification-socketio.singleton';
import { buildNotificationTitle, buildNotificationContent, getNotificationIcon, getNotificationLink, getNotificationBorderColor } from '@/utils/notification-helpers';
import { useI18n } from '@/hooks/useI18n';
import { useRouter } from 'next/navigation';

/**
 * Configuration du hook
 */
const HOOK_CONFIG = {
  POLLING_INTERVAL: 30000, // 30 secondes
  TOAST_DURATION: 4000
};

/**
 * Hook pour gérer les notifications v2
 */
export function useNotificationsManager() {
  const { user, authToken, isAuthenticated } = useAuthStore();
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const isInitialized = useRef(false);
  const { t, isLoading: isI18nLoading, locale } = useI18n('notifications');
  const router = useRouter();

  // Ref pour stocker la dernière version de showNotificationToast
  const showNotificationToastRef = useRef<((notification: NotificationV2) => void) | null>(null);

  // Debug: Log l'état du hook i18n
  useEffect(() => {
    if (!isI18nLoading) {
      console.log('[useNotificationsV2] i18n READY:', {
        isLoading: isI18nLoading,
        locale,
        testNewMessage: t('titles.newMessage', { sender: 'TestUser' }),
        testReaction: t('titles.reaction', { sender: 'André', emoji: '❤️' }),
        testMentioned: t('titles.mentioned', { sender: 'Marie' })
      });
    }
  }, [isI18nLoading, locale, t]);

  // Sélecteurs du store
  const notifications = useNotificationsV2();
  const unreadCount = useUnreadCountV2();
  const counts = useNotificationCountsV2();
  const actions = useNotificationActionsV2();
  const storeState = useNotificationStoreV2(
    useShallow(state => ({
      isLoading: state.isLoading,
      isLoadingMore: state.isLoadingMore,
      hasMore: state.hasMore,
      error: state.error,
      filters: state.filters,
      isConnected: state.isConnected
    }))
  );

  /**
   * Affiche un toast pour une nouvelle notification
   * Utilise le formatage i18n avec buildNotificationTitle et buildNotificationContent
   * Intègre l'avatar de l'auteur comme dans custom-toast.tsx
   */
  const showNotificationToast = useCallback((notification: NotificationV2) => {
    console.log('[Toast Debug] Notification received:', {
      id: notification.id,
      type: notification.type,
      sender: notification.sender,
      isI18nLoading,
      locale
    });

    const title = buildNotificationTitle(notification, t);
    const content = buildNotificationContent(notification, t);
    const link = getNotificationLink(notification);
    const borderColor = getNotificationBorderColor(notification);

    console.log('[Toast Debug] Toast data:', {
      title,
      content,
      link,
      borderColor
    });

    // Helper pour obtenir les initiales
    const getInitials = (name: string): string => {
      if (!name) return '?';
      const parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    };

    const hasAvatar = !!notification.sender;
    const senderName = notification.sender?.displayName ||
                       notification.sender?.firstName ||
                       notification.sender?.username ||
                       'User';

    // Toast personnalisé avec avatar de l'auteur
    toast.custom(
      (toastId) => (
        <div
          className={`flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border-l-4 ${borderColor} cursor-pointer hover:shadow-xl transition-shadow duration-200 min-w-[320px] max-w-[420px]`}
          onClick={() => {
            if (link) {
              router.push(link);
            }
            toast.dismiss(toastId);
          }}
        >
          {/* Avatar de l'auteur ou icône système */}
          {hasAvatar ? (
            <div className="w-10 h-10 flex-shrink-0">
              <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                {notification.sender?.avatar ? (
                  <img
                    src={notification.sender.avatar}
                    alt={senderName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getInitials(senderName)
                )}
              </div>
            </div>
          ) : (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <span className="text-lg">🔔</span>
            </div>
          )}

          {/* Contenu */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {title}
            </p>
            {content && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                {content}
              </p>
            )}
          </div>
        </div>
      ),
      {
        duration: 5000,
        position: 'top-right',
      }
    );
  }, [t, router]);

  // Mettre à jour la ref avec la dernière version de showNotificationToast
  useEffect(() => {
    showNotificationToastRef.current = showNotificationToast;
  }, [showNotificationToast]);

  /**
   * Démarre le polling en fallback
   */
  const startPolling = useCallback(() => {
    if (pollingInterval.current) {
      return;
    }

    console.log('[useNotificationsV2] Starting polling fallback...');

    pollingInterval.current = setInterval(() => {
      console.log('[useNotificationsV2] Polling notifications...');
      actions.refresh().catch(error => {
        console.error('[useNotificationsV2] Polling error:', error);
      });
    }, HOOK_CONFIG.POLLING_INTERVAL);
  }, [actions]);

  /**
   * Arrête le polling
   */
  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
      console.log('[useNotificationsV2] Polling stopped');
    }
  }, []);

  /**
   * Initialise le hook au montage
   */
  useEffect(() => {
    if (!isAuthenticated || !authToken || isInitialized.current) {
      return;
    }

    console.log('[useNotificationsV2] Initializing with singleton...');
    isInitialized.current = true;

    // Initialiser le store (charge les notifications depuis l'API)
    actions.initialize().then(() => {
      console.log('[useNotificationsV2] Store initialized, connecting Socket.IO...');

      // Connecter via le singleton
      notificationSocketIO.connect(authToken);
    });

    // Enregistrer les callbacks pour les événements du singleton
    const unsubNotification = notificationSocketIO.onNotification((notification) => {
      console.log('[useNotificationsV2] Received notification via singleton:', notification);
      actions.addNotification(notification);
      // Utiliser la ref pour avoir la dernière version de showNotificationToast
      showNotificationToastRef.current?.(notification);
    });

    const unsubRead = notificationSocketIO.onNotificationRead((notificationId) => {
      console.log('[useNotificationsV2] Notification read:', notificationId);
      actions.markAsRead(notificationId);
    });

    const unsubDeleted = notificationSocketIO.onNotificationDeleted((notificationId) => {
      console.log('[useNotificationsV2] Notification deleted:', notificationId);
      actions.deleteNotification(notificationId);
    });

    const unsubCounts = notificationSocketIO.onCounts((counts) => {
      console.log('[useNotificationsV2] Counts updated:', counts);
      actions.updateCounts(counts);
    });

    const unsubConnect = notificationSocketIO.onConnect(() => {
      console.log('[useNotificationsV2] Socket connected');
      setIsSocketConnected(true);
      stopPolling();
    });

    const unsubDisconnect = notificationSocketIO.onDisconnect((reason) => {
      console.warn('[useNotificationsV2] Socket disconnected:', reason);
      setIsSocketConnected(false);

      // Démarrer le polling en fallback si déconnexion involontaire
      if (reason !== 'io client disconnect') {
        startPolling();
      }
    });

    // Cleanup à la déconnexion du composant
    return () => {
      console.log('[useNotificationsV2] Cleaning up...');

      // Désinscrire tous les callbacks
      unsubNotification();
      unsubRead();
      unsubDeleted();
      unsubCounts();
      unsubConnect();
      unsubDisconnect();

      // Arrêter le polling
      stopPolling();

      // Déconnecter le store
      actions.disconnect();

      // Note: On ne déconnecte PAS le singleton car d'autres composants peuvent l'utiliser
      // Le singleton gère sa propre durée de vie

      isInitialized.current = false;
    };
  }, [isAuthenticated, authToken, actions, startPolling, stopPolling]);
  // Note: showNotificationToast est intentionnellement exclu des dépendances
  // pour éviter de réenregistrer les callbacks à chaque changement

  /**
   * Surveille le statut de connexion du singleton
   */
  useEffect(() => {
    if (!isAuthenticated || !authToken || !isInitialized.current) {
      return;
    }

    const checkStatus = () => {
      const status = notificationSocketIO.getConnectionStatus();
      setIsSocketConnected(status.isConnected);
    };

    // Vérifier périodiquement le statut
    const statusInterval = setInterval(checkStatus, 2000);

    return () => clearInterval(statusInterval);
  }, [isAuthenticated, authToken]);

  /**
   * Actions publiques
   */
  const markAsRead = useCallback(async (notificationId: string) => {
    await actions.markAsRead(notificationId);
  }, [actions]);

  const markAllAsRead = useCallback(async () => {
    await actions.markAllAsRead();
  }, [actions]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    await actions.deleteNotification(notificationId);
  }, [actions]);

  const fetchMore = useCallback(async () => {
    await actions.fetchMore();
  }, [actions]);

  const refresh = useCallback(async () => {
    await actions.refresh();
  }, [actions]);

  return {
    // État
    notifications,
    unreadCount,
    counts,
    isLoading: storeState.isLoading,
    isLoadingMore: storeState.isLoadingMore,
    hasMore: storeState.hasMore,
    error: storeState.error,
    isConnected: isSocketConnected,

    // Actions
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchMore,
    refresh
  };
}

/**
 * Hook simplifié pour obtenir uniquement le compteur de notifications non lues
 */
export function useUnreadNotificationsCount() {
  return useUnreadCountV2();
}

/**
 * Hook pour obtenir les compteurs détaillés
 */
export function useNotificationCounts() {
  return useNotificationCountsV2();
}
