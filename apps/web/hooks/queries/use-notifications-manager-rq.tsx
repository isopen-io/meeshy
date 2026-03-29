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
import type { Notification, NotificationFilters } from '@/types/notification';
import { toast } from 'sonner';
import { buildNotificationTitle, buildNotificationContent, getNotificationLink, getNotificationBorderColor } from '@/utils/notification-helpers';
import { useI18n } from '@/hooks/useI18n';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';

const recentToasts = new Set<string>();

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

  const {
    data: notificationsData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteNotificationsQuery({ limit, ...filters });

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

    const handleNewNotification = (notification: Notification) => {
      const notificationConversationId = notification.context?.conversationId;
      const activeConversationId = useNotificationStore.getState().activeConversationId;
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const isInActiveConversation = notificationConversationId && (
        activeConversationId === notificationConversationId ||
        currentPath.includes(`/conversations/${notificationConversationId}`)
      );

      const queries = queryClient.getQueriesData({ queryKey: queryKeys.notifications.lists(), exact: false });

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
          ? '/sounds/mention.wav'
          : '/sounds/notification.wav';
        const volume = notification.type === 'user_mentioned' ? 0.7 : 0.6;
        const audio = new Audio(soundFile);
        audio.volume = volume;
        audio.play().catch(() => {});
      } catch {
        // Silently ignore audio playback errors
      }
    };

    const handleNotificationRead = (notificationId: string) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[] }>; pageParams: unknown[] };
          return {
            ...data,
            pages: data.pages.map((page) => ({
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

      queryClient.setQueryData(
        queryKeys.notifications.unreadCount(),
        (old: number | undefined) => Math.max(0, (old ?? 1) - 1)
      );
    };

    const unsubscribeNotification = notificationSocketIO.onNotification(handleNewNotification);
    const unsubscribeRead = notificationSocketIO.onNotificationRead(handleNotificationRead);

    return () => {
      unsubscribeNotification();
      unsubscribeRead();
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
