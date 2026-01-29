/**
 * Hook gestionnaire de notifications utilisant React Query
 * Combine React Query pour les données et Socket.IO pour les mises à jour temps réel
 *
 * Drop-in replacement pour useNotificationsManager
 */

'use client';

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

export function useNotificationsManagerRQ(options: UseNotificationsManagerRQOptions = {}) {
  const { filters, limit = 20 } = options;
  const { t } = useI18n('notifications');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

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
      { duration: 4000 }
    );
  }, [t, router]);

  // Écouter les événements Socket.IO pour mettre à jour le cache
  useEffect(() => {
    if (!isAuthenticated) return;

    // Connecter le Socket.IO avec le token d'auth
    const authToken = useAuthStore.getState().token;
    if (authToken) {
      console.log('[useNotificationsManagerRQ] Connecting Socket.IO...');
      notificationSocketIO.connect(authToken);
    }

    const handleNewNotification = (notification: Notification) => {
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

      // Ne pas afficher de toast si l'utilisateur est dans la conversation active
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const notificationConversationId = notification.context?.conversationId;

      if (notificationConversationId && currentPath.includes(`/conversations/${notificationConversationId}`)) {
        console.log('[useNotificationsManagerRQ] Skipping toast - user in active conversation');
        return;
      }

      // Afficher le toast
      showNotificationToast(notification);
    };

    const handleNotificationRead = (notificationId: string) => {
      console.log('[useNotificationsManagerRQ] Marking notification as read:', notificationId);

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
    const unsubscribeNotification = notificationSocketIO.onNotification(handleNewNotification);
    const unsubscribeRead = notificationSocketIO.onNotificationRead(handleNotificationRead);

    return () => {
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
