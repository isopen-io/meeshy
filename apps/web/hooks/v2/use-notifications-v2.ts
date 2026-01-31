/**
 * Hook for V2 Notifications Management
 *
 * Provides notifications list, unread count, and real-time updates.
 * Replaces mock data in /v2/notifications page.
 */

'use client';

import { useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useNotificationsQuery,
  useInfiniteNotificationsQuery,
  useUnreadNotificationCountQuery,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useDeleteNotificationMutation,
} from '@/hooks/queries/use-notifications-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Notification, NotificationType } from '@/types/notification';

export interface NotificationV2 {
  id: string;
  type: NotificationType;
  user: {
    id: string;
    name: string;
    avatar?: string;
    languageCode: string;
  };
  content: string;
  time: string;
  isUnread: boolean;
  actionUrl?: string;
}

export interface UseNotificationsV2Options {
  enabled?: boolean;
  limit?: number;
  unreadOnly?: boolean;
}

export interface NotificationsV2Return {
  // Data
  notifications: NotificationV2[];
  unreadCount: number;

  // Loading states
  isLoading: boolean;
  isLoadingMore: boolean;

  // Pagination
  hasMore: boolean;
  loadMore: () => Promise<void>;

  // Actions
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;

  // Error
  error: string | null;
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(date: Date | string | undefined): string {
  if (!date) return '';

  const now = new Date();
  const notifDate = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - notifDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'A l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays}j`;

  return notifDate.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Get content string based on notification type
 */
function getNotificationContent(notification: Notification): string {
  const type = notification.type;

  switch (type) {
    case 'new_message':
    case 'message_reply':
      return 'vous a envoye un message';
    case 'mention':
    case 'user_mentioned':
      return 'vous a mentionne dans un commentaire';
    case 'reaction':
    case 'message_reaction':
      return 'a reagi a votre message';
    case 'friend_request':
    case 'contact_request':
      return 'vous a envoye une demande de contact';
    case 'friend_accepted':
    case 'contact_accepted':
      return 'a accepte votre demande de contact';
    case 'member_joined':
      return 'a rejoint la conversation';
    case 'member_left':
      return 'a quitte la conversation';
    case 'community_invite':
      return 'vous a invite a rejoindre une communaute';
    case 'community_announcement':
      return 'Nouvelle annonce dans votre communaute';
    case 'missed_call':
      return 'Appel manque';
    case 'translation_completed':
      return 'Traduction terminee';
    case 'system':
    case 'maintenance':
      return notification.content?.text || 'Notification systeme';
    default:
      return notification.content?.text || 'Nouvelle notification';
  }
}

/**
 * Get action URL based on notification context
 */
function getActionUrl(notification: Notification): string | undefined {
  const context = notification.context;

  if (context?.conversationId) {
    return `/v2/chats?id=${context.conversationId}`;
  }
  if (context?.communityId) {
    return `/v2/communities/${context.communityId}`;
  }
  if (notification.actor?.id) {
    return `/v2/u/${notification.actor.username || notification.actor.id}`;
  }

  return undefined;
}

/**
 * Transform Notification to NotificationV2 format
 */
function transformToNotificationV2(notification: Notification): NotificationV2 {
  const actor = notification.actor;

  return {
    id: notification.id,
    type: notification.type,
    user: {
      id: actor?.id || 'system',
      name: actor?.displayName || actor?.username || 'Systeme',
      avatar: actor?.avatarUrl,
      languageCode: (actor as any)?.systemLanguage || 'fr',
    },
    content: getNotificationContent(notification),
    time: formatRelativeTime(notification.state?.createdAt),
    isUnread: !notification.state?.isRead,
    actionUrl: getActionUrl(notification),
  };
}

export function useNotificationsV2(
  options: UseNotificationsV2Options = {}
): NotificationsV2Return {
  const { enabled = true, limit = 50, unreadOnly = false } = options;
  const queryClient = useQueryClient();

  // Query for notifications with infinite scroll
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteNotificationsQuery({
    limit,
    isRead: unreadOnly ? false : undefined,
  });

  // Query for unread count
  const { data: unreadCount = 0 } = useUnreadNotificationCountQuery();

  // Mutations
  const markAsReadMutation = useMarkNotificationAsReadMutation();
  const markAllAsReadMutation = useMarkAllNotificationsAsReadMutation();
  const deleteMutation = useDeleteNotificationMutation();

  // Extract and transform notifications from all pages
  const notifications = useMemo(() => {
    if (!data?.pages) return [];

    const allNotifications = data.pages.flatMap(
      (page) => page?.notifications || []
    );

    return allNotifications.map(transformToNotificationV2);
  }, [data?.pages]);

  // Actions
  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      await markAsReadMutation.mutateAsync(notificationId);
    },
    [markAsReadMutation]
  );

  const markAllAsRead = useCallback(async () => {
    await markAllAsReadMutation.mutateAsync();
  }, [markAllAsReadMutation]);

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      await deleteMutation.mutateAsync(notificationId);
    },
    [deleteMutation]
  );

  const refreshNotifications = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
    error: error?.message ?? null,
  };
}
