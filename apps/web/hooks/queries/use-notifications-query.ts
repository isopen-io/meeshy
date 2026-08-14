import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NotificationService } from '@/services/notification.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Notification, NotificationQueryOptions } from '@/types/notification';

/** Une page se demande par ANCRE (curseur) ou par RANG (offset) — jamais les deux. */
type NotificationPageParam = { cursor: string } | { offset: number };

export function useNotificationsQuery(options: NotificationQueryOptions = {}) {
  const { limit = 50, ...filters } = options;

  return useQuery({
    queryKey: queryKeys.notifications.list({ unreadOnly: filters.isRead === false }),
    queryFn: async () => {
      const response = await NotificationService.fetchNotifications({ ...filters, limit });
      return response.data;
    },
  });
}

export function useInfiniteNotificationsQuery(
  options: NotificationQueryOptions & { enabled?: boolean } = {}
) {
  const { limit = 50, enabled = true, ...filters } = options;

  return useInfiniteQuery({
    enabled,
    queryKey: [...queryKeys.notifications.lists(), 'infinite', filters],
    queryFn: async ({ pageParam }) => {
      const response = await NotificationService.fetchNotifications({
        ...filters,
        limit,
        ...pageParam,
      });
      return response.data;
    },
    initialPageParam: { offset: 0 } as NotificationPageParam,
    // Une cloche reçoit PENDANT qu'on la lit, et le socket insère en tête du
    // cache. Sous pagination par rang, chaque arrivée décale la liste d'un
    // cran : la page suivante re-sert la dernière ligne déjà affichée (doublon,
    // clés React en conflit) et saute la première jamais vue. Le curseur
    // keyset, lui, est ancré sur une LIGNE — l'insertion ne le déplace pas.
    getNextPageParam: (lastPage): NotificationPageParam | undefined => {
      const pagination = lastPage?.pagination;
      if (!pagination?.hasMore) return undefined;

      // `nextCursor` absent = gateway antérieure au curseur (le web se déploie
      // en premier) : l'offset reste le seul moyen d'avancer. `null` = fin de
      // liste, et sans ancre il n'y a rien à demander de plus.
      if (pagination.nextCursor !== undefined) {
        return pagination.nextCursor === null ? undefined : { cursor: pagination.nextCursor };
      }

      return { offset: (pagination.offset ?? 0) + pagination.limit };
    },
    // Le client global tourne en `staleTime: Infinity` + `refetchOnMount: false`
    // (Socket.IO est la source temps réel). Mais le socket ne pousse RIEN quand
    // l'app est fermée : une liste restaurée du cache restait alors affichée
    // telle quelle, sans jamais montrer les notifications reçues entre-temps —
    // ni dans la cloche, ni sur /notifications, quel que soit le nombre de
    // rechargements. Monter la cloche ou la page relit donc toujours le serveur.
    refetchOnMount: 'always',
  });
}

export function useUnreadNotificationCountQuery() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => {
      const response = await NotificationService.getUnreadCount();
      return response.data?.count ?? 0;
    },
    // No refetchInterval — the notification socket manager updates this count
    // directly via setQueryData on every notification:new event. It still has to
    // re-read on mount: the socket pushes nothing while the app is closed, so a
    // restored count would otherwise stay frozen at its last-seen value.
    refetchOnMount: 'always',
  });
}

/**
 * Les totaux d'onglets, lus sur l'inbox ENTIÈRE.
 *
 * `refetchOnMount: 'always'` pour la même raison que la liste : le socket ne
 * pousse rien quand l'app est fermée, et `staleTime: Infinity` figerait sinon
 * des pastilles au chiffre de la dernière session.
 */
export function useNotificationCountsQuery(enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.notifications.counts(),
    queryFn: async () => {
      const response = await NotificationService.getCounts();
      return response.data;
    },
    refetchOnMount: 'always',
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

      // Ne décrémenter que si la notification était réellement NON LUE : un
      // second clic (ou un clic sur une ligne déjà lue) faisait dériver le
      // compteur vers le bas jusqu'au prochain refetch.
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
