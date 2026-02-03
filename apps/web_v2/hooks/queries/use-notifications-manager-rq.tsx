/**
 * Hook gestionnaire de notifications utilisant React Query
 * Combine React Query pour les données et Socket.IO pour les mises à jour temps réel
 *
 * Drop-in replacement pour useNotificationsManager
 */

'use client';

if (typeof window !== 'undefined') {
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

  // Détecter si mobile une seule fois au montage
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Set pour tracker les toasts récents (éviter les doublons)
  const recentToasts = typeof window !== 'undefined'
    ? (window as any).__NOTIFICATION_TOASTS_SHOWN__ || new Set<string>()
    : new Set<string>();

  if (typeof window !== 'undefined') {
    (window as any).__NOTIFICATION_TOASTS_SHOWN__ = recentToasts;
  }

  // Afficher un toast pour une nouvelle notification (une seule fois globalement)
  const showNotificationToast = useCallback((notification: Notification) => {
    // Éviter les toasts dupliqués en vérifiant si déjà affiché récemment
    const toastKey = `${notification.id}-${notification.state.createdAt}`;

    if (recentToasts.has(toastKey)) {
      return;
    }

    // Marquer comme affiché
    recentToasts.add(toastKey);

    // Nettoyer après 5 secondes (au cas où la même notification serait re-émise)
    setTimeout(() => {
      recentToasts.delete(toastKey);
    }, 5000);

    const title = buildNotificationTitle(notification, t);
    const content = buildNotificationContent(notification, t);
    const link = getNotificationLink(notification);
    const borderColor = getNotificationBorderColor(notification);

    // Durée réduite sur mobile (2s au lieu de 4s)
    const duration = isMobile ? 2000 : 4000;

    toast.custom(
      (toastId) => (
        <div
          className={`flex items-start gap-3 p-4 bg-background border rounded-lg shadow-lg cursor-pointer ${borderColor}`}
          onClick={() => {
            toast.dismiss(toastId);
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
  }, [t, router, isMobile]);

  // Écouter les événements Socket.IO pour mettre à jour le cache
  useEffect(() => {
    // Connecter pour les utilisateurs authentifiés OU anonymes avec sessionToken
    const authToken = useAuthStore.getState().authToken;

    if (!isAuthenticated && !authToken) {
      return;
    }

    // Connecter le Socket.IO avec le token d'auth (ou sessionToken pour anonymes)
    if (authToken) {
      notificationSocketIO.connect(authToken);
    }

    const handleNewNotification = (notification: Notification) => {
      // Vérifier si la notification existe déjà dans le cache
      const queries = queryClient.getQueriesData({ queryKey: queryKeys.notifications.lists(), exact: false });

      const notificationExists = queries.some(([key, data]: any) => {
        if (!data || !data.pages) {
          return false;
        }
        const exists = data.pages.some((page: any) =>
          (page.notifications ?? []).some((n: Notification) => n.id === notification.id)
        );
        return exists;
      });

      if (notificationExists) {
        // NE PAS ajouter à nouveau au cache, mais continuer pour afficher le toast si approprié
      } else {

        // Mettre à jour le cache React Query pour TOUTES les queries infinite qui commencent par notifications.lists()
        queryClient.setQueriesData(
          { queryKey: queryKeys.notifications.lists(), exact: false },
          (old: any) => {
            if (!old || !old.pages) return old;

            // Ajouter la nouvelle notification au début de la première page
            const updatedPages = old.pages.map((page: any, index: number) => {
              if (index === 0) {
                return {
                  ...page,
                  notifications: [notification, ...(page.notifications ?? [])],
                  // Incrémenter unreadCount si présent
                  unreadCount: (page.unreadCount ?? 0) + 1,
                };
              }
              return page;
            });

            return {
              ...old,
              pages: updatedPages,
            };
          }
        );

        // Mettre à jour le compteur (uniquement si nouveau)
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(),
          (old: number | undefined) => (old ?? 0) + 1
        );
      }

      // Décider si on affiche un toast
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const notificationConversationId = notification.context?.conversationId;

      // Ne pas afficher si déjà sur la page des notifications
      if (currentPath === '/notifications') {
        return;
      }

      // Ne pas afficher si dans la conversation concernée par la notification
      if (notificationConversationId && currentPath.includes(`/conversations/${notificationConversationId}`)) {
        return;
      }

      // Afficher le toast
      showNotificationToast(notification);

      // Jouer le son approprié selon le type de notification
      try {
        // Utiliser mention.wav pour les mentions, notification.wav pour le reste
        const soundFile = notification.type === 'user_mentioned'
          ? '/sounds/mention.wav'
          : '/sounds/notification.wav';

        const volume = notification.type === 'user_mentioned' ? 0.7 : 0.6;

        const audio = new Audio(soundFile);
        audio.volume = volume;
        audio.play().catch(() => {
          // Silently ignore audio playback errors
        });
      } catch (error) {
        // Silently ignore audio playback errors
      }
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
      // Silently ignore errors
    }
  }, [markAsReadMutation]);

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllAsReadMutation.mutateAsync();
    } catch (error) {
      // Silently ignore errors
    }
  }, [markAllAsReadMutation]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      await deleteMutation.mutateAsync(notificationId);
    } catch (error) {
      // Silently ignore errors
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
