import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NotificationService } from '@/services/notification.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Notification, NotificationFilters, NotificationPaginationOptions } from '@/types/notification';

type NotificationsFiltersAndPagination = Partial<NotificationFilters & NotificationPaginationOptions>;

export function useNotificationsQuery(options: NotificationsFiltersAndPagination = {}) {
  const { limit = 50, ...filters } = options;

  return useQuery({
    queryKey: queryKeys.notifications.list({ unreadOnly: filters.isRead === false }),
    queryFn: async () => {
      const response = await NotificationService.fetchNotifications({ ...filters, limit });
      return response.data;
    },
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
  });
}

export function useUnreadNotificationCountQuery() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => {
      const response = await NotificationService.getUnreadCount();
      return response.data?.count ?? 0;
    },
    refetchInterval: 60 * 1000,
  });
}

export function useNotificationCountsQuery() {
  return useQuery({
    queryKey: [...queryKeys.notifications.all, 'counts'],
    queryFn: async () => {
      const response = await NotificationService.getCounts();
      return response.data;
    },
  });
}

export function useMarkNotificationAsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      NotificationService.markAsRead(notificationId),
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.lists() });
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.unreadCount() });

      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.notifications.lists() });
      const previousUnread = queryClient.getQueryData(queryKeys.notifications.unreadCount());

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.map((n: Notification) =>
                n.id === notificationId
                  ? { ...n, state: { ...n.state, isRead: true, readAt: new Date() } }
                  : n
              ),
              unreadCount: Math.max(0, (page.unreadCount ?? 0) - 1),
            })),
          };
        }
      );

      queryClient.setQueryData(
        queryKeys.notifications.unreadCount(),
        (old: number | undefined) => Math.max(0, (old ?? 1) - 1)
      );

      return { previousLists, previousUnread };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousUnread !== undefined) {
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), context.previousUnread);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsAsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => NotificationService.markAllAsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.lists() });
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.unreadCount() });

      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.notifications.lists() });
      const previousUnread = queryClient.getQueryData(queryKeys.notifications.unreadCount());

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.map((n: Notification) => ({
                ...n,
                state: { ...n.state, isRead: true, readAt: n.state.readAt ?? new Date() },
              })),
              unreadCount: 0,
            })),
          };
        }
      );

      queryClient.setQueryData(queryKeys.notifications.unreadCount(), 0);

      return { previousLists, previousUnread };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousUnread !== undefined) {
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), context.previousUnread);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useDeleteNotificationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      NotificationService.deleteNotification(notificationId),
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.lists() });
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.unreadCount() });

      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.notifications.lists() });
      const previousUnread = queryClient.getQueryData(queryKeys.notifications.unreadCount());

      let wasUnread = false;

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };
          return {
            ...data,
            pages: data.pages.map((page) => {
              const deleted = page.notifications?.find((n: Notification) => n.id === notificationId);
              if (deleted && !deleted.state.isRead) wasUnread = true;
              return {
                ...page,
                notifications: page.notifications?.filter((n: Notification) => n.id !== notificationId),
                unreadCount: deleted && !deleted.state.isRead
                  ? Math.max(0, (page.unreadCount ?? 0) - 1)
                  : page.unreadCount,
              };
            }),
          };
        }
      );

      if (wasUnread) {
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(),
          (old: number | undefined) => Math.max(0, (old ?? 1) - 1)
        );
      }

      return { previousLists, previousUnread };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousUnread !== undefined) {
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), context.previousUnread);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
    },
  });
}

export function useDeleteAllReadNotificationsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => NotificationService.deleteAllRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.lists() });

      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.notifications.lists() });

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.filter((n: Notification) => !n.state.isRead),
            })),
          };
        }
      );

      return { previousLists };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
