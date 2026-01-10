import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NotificationService } from '@/services/notification.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { NotificationFilters, NotificationPaginationOptions } from '@/types/notification';

type NotificationsFiltersAndPagination = Partial<NotificationFilters & NotificationPaginationOptions>;

export function useNotificationsQuery(options: NotificationsFiltersAndPagination = {}) {
  const { limit = 50, ...filters } = options;

  return useQuery({
    queryKey: queryKeys.notifications.list({ unreadOnly: filters.isRead === false }),
    queryFn: async () => {
      const response = await NotificationService.fetchNotifications({ ...filters, limit });
      return response.data;
    },
    // staleTime: Infinity (Socket.IO gère les mises à jour)
  });
}

export function useInfiniteNotificationsQuery(options: NotificationsFiltersAndPagination = {}) {
  const { limit = 50, ...filters } = options;

  return useInfiniteQuery({
    queryKey: [...queryKeys.notifications.lists(), 'infinite', filters],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await NotificationService.fetchNotifications({
        ...filters,
        limit,
        offset: pageParam,
      });
      return response.data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.pagination?.hasMore) return undefined;
      return lastPage.pagination.offset + lastPage.pagination.limit;
    },
    // staleTime: Infinity (Socket.IO gère les mises à jour)
  });
}

export function useUnreadNotificationCountQuery() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => {
      const response = await NotificationService.getUnreadCount();
      return response.data?.count ?? 0;
    },
    // staleTime: Infinity (Socket.IO gère les mises à jour)
    // Polling léger comme safety net si Socket.IO rate des events
    refetchInterval: 60 * 1000, // 1 minute (réduit vs 30s avant)
  });
}

export function useNotificationCountsQuery() {
  return useQuery({
    queryKey: [...queryKeys.notifications.all, 'counts'],
    queryFn: async () => {
      const response = await NotificationService.getCounts();
      return response.data?.counts;
    },
    // staleTime: Infinity (Socket.IO gère les mises à jour)
  });
}

export function useMarkNotificationAsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      NotificationService.markAsRead(notificationId),
    onSuccess: () => {
      // Invalidate all notification queries
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsAsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => NotificationService.markAllAsRead(),
    onSuccess: () => {
      // Invalidate all notification queries
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useDeleteNotificationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      NotificationService.deleteNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
    },
  });
}

export function useDeleteAllReadNotificationsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => NotificationService.deleteAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
