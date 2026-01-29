/**
 * Hook gestionnaire de notifications utilisant React Query
 * Combine React Query pour les données et Socket.IO pour les mises à jour temps réel
 *
 * Drop-in replacement pour useNotificationsManager
 */

'use client';

// LOG GLOBAL AU CHARGEMENT DU MODULE
if (typeof window !== 'undefined') {
  console.log('🚨🚨🚨 [useNotificationsManagerRQ] MODULE LOADED AT:', new Date().toISOString());
  (window as any).__USE_NOTIFICATIONS_RQ_LOADED__ = true;
}

import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInfiniteNotificationsQuery,
  useUnreadNotificationCountQuery,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useDeleteNotificationMutation,
} from './use-notifications-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { notificationSocketIO } from '@/services/notification-socketio.singleton';
import type { Notification, NotificationFilters } from '@/types/notification';
import { toast } from 'sonner';
import { buildNotificationTitle, buildNotificationContent, getNotificationLink, getNotificationBorderColor } from '@/utils/notification-helpers';
import { useI18n } from '@/hooks/useI18n';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

interface UseNotificationsManagerRQOptions {
  filters?: NotificationFilters;
  limit?: number;
}

console.log('🚀 [useNotificationsManagerRQ] Hook file loaded!');

export function useNotificationsManagerRQ(options: UseNotificationsManagerRQOptions = {}) {
  console.log('🚀 [useNotificationsManagerRQ] Hook function called!', { options });

  const { filters, limit = 20 } = options;
  const { t } = useI18n('notifications');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  console.log('🚀 [useNotificationsManagerRQ] Hooks initialized', {
    isAuthenticated,
    limit,
    filters,
  });

  // Query pour les notifications
  const {
    data: notificationsData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteNotificationsQuery({ limit, ...filters });

  // Extraire le compteur non-lus depuis les données de notification
  // Le backend retourne unreadCount dans la première page de réponse
  const unreadCount = notificationsData?.pages[0]?.unreadCount ?? 0;

  // Mutations
  const markAsReadMutation = useMarkNotificationAsReadMutation();
  const markAllAsReadMutation = useMarkAllNotificationsAsReadMutation();
  const deleteMutation = useDeleteNotificationMutation();

  // Extraire les notifications depuis les pages
  const notifications = notificationsData?.pages.flatMap(
    page => page.notifications ?? []
  ) ?? [];

  // Afficher un toast pour une nouvelle notification
  const showNotificationToast = useCallback((notification: Notification) => {
    const title = buildNotificationTitle(notification, t);
    const content = buildNotificationContent(notification, t);
    const link = getNotificationLink(notification);
    const borderColor = getNotificationBorderColor(notification);

    // Durée réduite sur mobile (2s au lieu de 4s)
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const duration = isMobile ? 2000 : 4000;

    toast.custom(
      () => (
        <div
          className={`flex items-start gap-3 p-4 bg-background border rounded-lg shadow-lg cursor-pointer ${borderColor}`}
          onClick={() => {
            if (link) {
              router.push(link);
            }
          }}
        >
          <div className="flex-1">
            <p className="font-medium text-sm">{title}</p>
            {content && <p className="text-muted-foreground text-xs mt-1">{content}</p>}
          </div>
        </div>
      ),
      { duration }
    );
  }, [t, router]);

  // Écouter les événements Socket.IO pour mettre à jour le cache
  useEffect(() => {
    console.log('🎯 [useNotificationsManagerRQ] useEffect monté', {
      isAuthenticated,
      hasToken: !!useAuthStore.getState().authToken,
    });

    if (!isAuthenticated) {
      console.log('[useNotificationsManagerRQ] User not authenticated, skipping Socket.IO connection');
      return;
    }

    // Connecter le Socket.IO avec le token d'auth
    const authToken = useAuthStore.getState().authToken;
    if (authToken) {
      console.log('[useNotificationsManagerRQ] Connecting Socket.IO...');
      notificationSocketIO.connect(authToken);
    } else {
      console.warn('[useNotificationsManagerRQ] No auth token found!');
    }

    const handleNewNotification = (notification: Notification) => {
      console.log('🔔 [useNotificationsManagerRQ] handleNewNotification appelé', {
        notificationId: notification.id,
        type: notification.type,
        userId: notification.userId,
        content: notification.content,
      });

      // Mettre à jour le cache React Query
      queryClient.setQueryData(
        queryKeys.notifications.lists(),
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any, index: number) =>
              index === 0
                ? { ...page, notifications: [notification, ...(page.notifications ?? [])] }
                : page
            ),
          };
        }
      );

      // Mettre à jour le compteur
      queryClient.setQueryData(
        queryKeys.notifications.unreadCount(),
        (old: number | undefined) => (old ?? 0) + 1
      );

      // Ne pas afficher de toast si l'utilisateur est sur la page des notifications ou dans la conversation active
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const notificationConversationId = notification.context?.conversationId;

      console.log('[useNotificationsManagerRQ] Toast filter check', {
        currentPath,
        notificationConversationId,
        isOnNotificationsPage: currentPath === '/notifications',
        isInActiveConversation: notificationConversationId && currentPath.includes(`/conversations/${notificationConversationId}`),
      });

      // Ne pas afficher si déjà sur la page des notifications
      if (currentPath === '/notifications') {
        console.log('[useNotificationsManagerRQ] Skipping toast - user on notifications page');
        return;
      }

      // Ne pas afficher si dans la conversation concernée par la notification
      if (notificationConversationId && currentPath.includes(`/conversations/${notificationConversationId}`)) {
        console.log('[useNotificationsManagerRQ] Skipping toast - user in active conversation');
        return;
      }

      // Afficher le toast
      console.log('[useNotificationsManagerRQ] Showing toast notification...');
      showNotificationToast(notification);
    };

    const handleNotificationRead = (notificationId: string) => {
      queryClient.setQueryData(
        queryKeys.notifications.lists(),
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              notifications: page.notifications?.map((n: Notification) =>
                n.id === notificationId
                  ? { ...n, state: { ...n.state, isRead: true, readAt: new Date() } }
                  : n
              ),
            })),
          };
        }
      );

      // Décrémenter le compteur
      queryClient.setQueryData(
        queryKeys.notifications.unreadCount(),
        (old: number | undefined) => Math.max(0, (old ?? 1) - 1)
      );
    };

    // S'abonner aux événements via les méthodes du singleton
    console.log('[useNotificationsManagerRQ] Subscribing to Socket.IO events...');
    const unsubscribeNotification = notificationSocketIO.onNotification(handleNewNotification);
    const unsubscribeRead = notificationSocketIO.onNotificationRead(handleNotificationRead);
    console.log('[useNotificationsManagerRQ] Subscribed to Socket.IO events ✅');

    return () => {
      console.log('[useNotificationsManagerRQ] Unsubscribing from Socket.IO events...');
      unsubscribeNotification();
      unsubscribeRead();
    };
  }, [isAuthenticated, queryClient, showNotificationToast]);

  // Actions
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await markAsReadMutation.mutateAsync(notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, [markAsReadMutation]);

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllAsReadMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, [markAllAsReadMutation]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      await deleteMutation.mutateAsync(notificationId);
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }, [deleteMutation]);

  const fetchMore = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    // État
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    error: null,

    // Actions
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchMore,
    refresh,

    // Pour compatibilité avec l'ancien hook
    counts: {
      total: notifications.length,
      unread: unreadCount,
    },
  };
}
