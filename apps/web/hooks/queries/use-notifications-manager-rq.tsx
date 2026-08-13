'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInfiniteNotificationsQuery,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useDeleteNotificationMutation,
} from './use-notifications-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { notificationSocketIO } from '@/services/notification-socketio.singleton';
import { NotificationService } from '@/services/notification.service';
import type { Notification, NotificationFilters } from '@/types/notification';
import type { NotificationReadBulkEventData } from '@meeshy/shared/types/socketio-events';
import { notificationMatchesReadBulkScope } from '@meeshy/shared/utils/notification-read-bulk';
import { toast } from 'sonner';
import { buildNotificationTitle, buildNotificationContent, getNotificationLink, getNotificationBorderColor } from '@/utils/notification-helpers';
import { useI18n } from '@/hooks/useI18n';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';

const recentToasts = new Set<string>();

/** Miroir du débounce de `NotificationGapResyncCoordinator` (iOS, 0.3 s). */
const SYNC_RESYNC_DEBOUNCE_MS = 300;

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
  const isMobileRef = useRef(typeof window !== 'undefined' && window.innerWidth < 768);
  const resyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    data: notificationsData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  // `enabled` : le manager est monté au layout RACINE (TabNotificationManager),
  // donc aussi sur /login, /join/*, etc. Sans garde, la query (refetchOnMount
  // 'always' + withRetry) tirait des GET /notifications non authentifiés sur
  // toutes les pages publiques.
  } = useInfiniteNotificationsQuery({ limit, enabled: isAuthenticated, ...filters });

  const unreadCount = notificationsData?.pages[0]?.unreadCount ?? 0;

  const markAsReadMutation = useMarkNotificationAsReadMutation();
  const markAllAsReadMutation = useMarkAllNotificationsAsReadMutation();
  const deleteMutation = useDeleteNotificationMutation();

  const notifications = notificationsData?.pages.flatMap(
    page => page?.notifications ?? []
  ) ?? [];

  const showNotificationToast = useCallback((notification: Notification) => {
    const toastKey = `${notification.id}-${notification.state.createdAt}`;

    if (recentToasts.has(toastKey)) return;

    recentToasts.add(toastKey);
    setTimeout(() => recentToasts.delete(toastKey), 5000);

    const title = buildNotificationTitle(notification, t);
    const content = buildNotificationContent(notification, t);
    const link = getNotificationLink(notification);
    const borderColor = getNotificationBorderColor(notification);
    const duration = isMobileRef.current ? 2000 : 4000;

    toast.custom(
      (toastId) => (
        <div
          className={`flex items-start gap-3 p-4 bg-background border rounded-lg shadow-lg cursor-pointer ${borderColor}`}
          onClick={() => {
            toast.dismiss(toastId);
            if (link) router.push(link);
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

  useEffect(() => {
    const authToken = useAuthStore.getState().authToken;

    if (!isAuthenticated && !authToken) return;

    if (authToken) {
      notificationSocketIO.connect(authToken);
    }

    const handleNewNotification = (incoming: Notification) => {
      const notificationConversationId = incoming.context?.conversationId;
      const activeConversationId = useNotificationStore.getState().activeConversationId;
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const isInActiveConversation = notificationConversationId && (
        activeConversationId === notificationConversationId ||
        currentPath.includes(`/conversations/${notificationConversationId}`)
      );

      // Une notification pour la conversation OUVERTE naît consommée (miroir du
      // `markConsumedOnArrival` iOS) : insérée déjà lue — sinon la liste montre
      // une ligne non lue alors que le compteur n'a pas bougé — et marquée lue
      // côté serveur pour que `notification:counts` et le badge push ne la
      // recomptent pas.
      const notification: Notification = isInActiveConversation
        ? { ...incoming, state: { ...incoming.state, isRead: true, readAt: new Date() } }
        : incoming;
      if (isInActiveConversation) {
        NotificationService.markAsRead(incoming.id).catch(() => {});
      }

      const queries = queryClient.getQueriesData({ queryKey: queryKeys.notifications.lists(), exact: false });

      // Aucune liste n'a encore de données (fetch initial en vol, ou écran
      // jamais monté) : `setQueriesData` ci-dessous n'écrirait NULLE PART et la
      // notification serait perdue sans rattrapage, `staleTime: Infinity`
      // interdisant toute relecture. On invalide pour forcer le serveur.
      const hasCachedList = queries.some(([_key, data]: [unknown, unknown]) =>
        !!data && typeof data === 'object' && 'pages' in data
      );

      if (!hasCachedList) {
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists() });
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
      }

      const notificationExists = queries.some(([_key, data]: [unknown, unknown]) => {
        if (!data || typeof data !== 'object' || !('pages' in data)) return false;
        const d = data as { pages: Array<{ notifications?: Notification[] }> };
        return d.pages.some((page) =>
          (page.notifications ?? []).some((n: Notification) => n.id === notification.id)
        );
      });

      if (!notificationExists) {
        queryClient.setQueriesData(
          { queryKey: queryKeys.notifications.lists(), exact: false },
          (old: unknown) => {
            if (!old || typeof old !== 'object' || !('pages' in old)) return old;
            const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };

            const updatedPages = data.pages.map((page, index: number) => {
              if (index === 0) {
                return {
                  ...page,
                  notifications: [notification, ...(page.notifications ?? [])],
                  unreadCount: isInActiveConversation
                    ? (page.unreadCount ?? 0)
                    : (page.unreadCount ?? 0) + 1,
                };
              }
              return page;
            });

            return { ...data, pages: updatedPages };
          }
        );

        if (!isInActiveConversation) {
          queryClient.setQueryData(
            queryKeys.notifications.unreadCount(),
            (old: number | undefined) => (old ?? 0) + 1
          );
        }
      }

      if (isInActiveConversation || currentPath === '/notifications') return;

      showNotificationToast(notification);

      try {
        const soundFile = notification.type === 'user_mentioned'
          ? '/sounds/mention.ogg'
          : '/sounds/notification.ogg';
        const volume = notification.type === 'user_mentioned' ? 0.7 : 0.6;
        const audio = new Audio(soundFile);
        audio.volume = volume;
        audio.play().catch(() => {});
      } catch {
        // Silently ignore audio playback errors
      }
    };

    const handleNotificationRead = (notificationId: string) => {
      let wasUnread = false;

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };

          const foundUnread = data.pages.some((page) =>
            page.notifications?.some((n: Notification) => n.id === notificationId && !n.state.isRead)
          );
          if (foundUnread) wasUnread = true;

          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.map((n: Notification) =>
                n.id === notificationId
                  ? { ...n, state: { ...n.state, isRead: true, readAt: new Date() } }
                  : n
              ),
              unreadCount: foundUnread
                ? Math.max(0, (page.unreadCount ?? 0) - 1)
                : page.unreadCount,
            })),
          };
        }
      );

      if (wasUnread) {
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(),
          (old: number | undefined) => Math.max(0, (old ?? 1) - 1)
        );
      }
    };

    // `notification:read-bulk` — un marquage EN MASSE côté gateway
    // (`updateMany`/`$runCommandRaw`) ne renvoie aucun id : l'événement annonce
    // le PRÉDICAT appliqué, rejoué ici sur les pages en cache via l'énoncé
    // partagé du prédicat (aucune réécriture locale — web et iOS marqueraient
    // sinon des lignes différentes de celles marquées en base).
    //
    // Le badge n'est pas touché : ce cache est PARTIEL (pagination), il matche
    // donc moins de lignes que le serveur n'en a marquées, et décrémenter d'ici
    // le ferait dériver. `notification:counts`, émis juste après, est
    // autoritaire et absolu.
    const handleNotificationReadBulk = ({ scope }: NotificationReadBulkEventData) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[] }>; pageParams: unknown[] };

          const touched = data.pages.some((page) =>
            page.notifications?.some(
              (n: Notification) => !n.state.isRead && notificationMatchesReadBulkScope(scope, n)
            )
          );
          if (!touched) return old;

          const readAt = new Date();
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.map((n: Notification) =>
                !n.state.isRead && notificationMatchesReadBulkScope(scope, n)
                  ? { ...n, state: { ...n.state, isRead: true, readAt } }
                  : n
              ),
            })),
          };
        }
      );
    };

    const handleNotificationDeleted = (notificationId: string) => {
      let wasUnread = false;

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };

          const foundUnread = data.pages.some((page) =>
            page.notifications?.some((n: Notification) => n.id === notificationId && !n.state.isRead)
          );
          if (foundUnread) wasUnread = true;

          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.filter((n: Notification) => n.id !== notificationId),
              unreadCount: foundUnread
                ? Math.max(0, (page.unreadCount ?? 0) - 1)
                : page.unreadCount,
            })),
          };
        }
      );

      if (wasUnread) {
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(),
          (old: number | undefined) => Math.max(0, (old ?? 1) - 1)
        );
      }
    };

    // `notification:counts` est la resync AUTORITAIRE du serveur : émise après
    // chaque marquage côté gateway (ouverture de conversation, vue d'un post,
    // action sur un autre appareil). Sans elle, la cloche ne se corrigeait
    // qu'au prochain refetch (montage / focus fenêtre).
    const handleCounts = (counts: { unread?: number; total?: number }) => {
      if (typeof counts?.unread !== 'number') return;

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };
          if (data.pages.every((page) => page.unreadCount === counts.unread)) return old;
          return {
            ...data,
            pages: data.pages.map((page) => ({ ...page, unreadCount: counts.unread })),
          };
        }
      );

      queryClient.setQueryData(queryKeys.notifications.unreadCount(), counts.unread);
    };

    // SyncEngine — le transport a détecté que le client a perdu de vue l'état
    // serveur (trou de `_seq`, ou reconnexion après coupure). Le client global
    // tourne en `staleTime: Infinity` : sans ce rattrapage, les notifications
    // manquées ne réapparaissent JAMAIS de la session, ni dans la cloche ni sur
    // /notifications. Le refetch est idempotent (la réponse serveur remplace
    // les pages, dédup par id inhérente) et débouncé pour coaléscer une rafale
    // — un gap suivi d'un reconnect ne paie qu'une resync.
    const scheduleResync = () => {
      if (resyncTimerRef.current !== null) clearTimeout(resyncTimerRef.current);
      resyncTimerRef.current = setTimeout(() => {
        resyncTimerRef.current = null;
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists() });
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
      }, SYNC_RESYNC_DEBOUNCE_MS);
    };

    const unsubscribeNotification = notificationSocketIO.onNotification(handleNewNotification);
    const unsubscribeRead = notificationSocketIO.onNotificationRead(handleNotificationRead);
    const unsubscribeReadBulk = notificationSocketIO.onNotificationReadBulk(handleNotificationReadBulk);
    const unsubscribeDeleted = notificationSocketIO.onNotificationDeleted(handleNotificationDeleted);
    const unsubscribeCounts = notificationSocketIO.onCounts(handleCounts);
    const unsubscribeDesync = notificationSocketIO.onSyncDesync(scheduleResync);

    return () => {
      unsubscribeNotification();
      unsubscribeRead();
      unsubscribeReadBulk();
      unsubscribeDeleted();
      unsubscribeCounts();
      unsubscribeDesync();
      if (resyncTimerRef.current !== null) {
        clearTimeout(resyncTimerRef.current);
        resyncTimerRef.current = null;
      }
    };
  }, [isAuthenticated, queryClient, showNotificationToast]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await markAsReadMutation.mutateAsync(notificationId);
    } catch {
      // Silently ignore - optimistic update handles UI
    }
  }, [markAsReadMutation]);

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllAsReadMutation.mutateAsync();
    } catch {
      // Silently ignore - optimistic update handles UI
    }
  }, [markAllAsReadMutation]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      await deleteMutation.mutateAsync(notificationId);
    } catch {
      // Silently ignore - optimistic update handles UI
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
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    error: null,

    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchMore,
    refresh,

    counts: {
      total: notifications.length,
      unread: unreadCount,
    },
  };
}
