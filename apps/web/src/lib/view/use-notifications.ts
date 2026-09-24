import { useInfiniteQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import {
  flattenNotificationPages,
  notificationListKey,
  notificationsInfiniteOptions,
  refreshNotifications,
  type NotificationsInfiniteData,
} from '@/lib/api/notifications';
import {
  performDeleteNotification,
  performMarkAllNotificationsRead,
  performMarkNotificationRead,
} from '@/lib/api/notifications-actions';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { categoryAccepts, type NotificationCategory } from '@/lib/notifications/categories';

/**
 * **LA CLOCHE, CÔTÉ ÉCRAN** (#6288) — les hooks de la route `/notifications` et
 * ses gestes, en RÉFÉRENCES DE MODULE STABLES (motif `rowAction`,
 * `api/query.ts`) : les rangées sont mémoïsées et ne doivent pas se re-rendre
 * parce qu'une fonction a changé d'identité.
 */

/**
 * CACHE D'ABORD, MÊME POUR UNE CATÉGORIE JAMAIS OUVERTE : tant que sa propre
 * page n'est pas arrivée, la catégorie se peint avec les lignes de « Toutes »
 * déjà en cache qui lui appartiennent. Jamais un squelette sur des lignes que
 * l'écran montrait l'instant d'avant ; la page servie les remplace dès qu'elle
 * arrive. Rien en cache ⇒ `undefined` ⇒ le squelette, qui est alors juste.
 */
function seededFromAll(category: NotificationCategory): NotificationsInfiniteData | undefined {
  if (category === 'all') return undefined;
  const notifications =
    appQueryClient
      .getQueryData<NotificationsInfiniteData>(notificationListKey('all'))
      ?.pages.flatMap((page) => page.notifications)
      .filter((notification) => categoryAccepts(category, notification)) ?? [];
  return notifications.length === 0
    ? undefined
    : { pages: [{ notifications, hasMore: false, nextCursor: null }], pageParams: [undefined] };
}

export function useNotifications(category: NotificationCategory) {
  const authenticated = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  return useInfiniteQuery(
    {
      ...notificationsInfiniteOptions(apiDeps, category),
      select: flattenNotificationPages,
      placeholderData: () => seededFromAll(category),
      enabled: apiDeps.source === 'fixtures' || authenticated,
    },
    appQueryClient,
  );
}

const actionDeps = () => ({ ...apiDeps, queryClient: appQueryClient });

export const markNotificationReadAction = (id: string): Promise<boolean> =>
  performMarkNotificationRead({ id, deps: actionDeps() });

export const markAllNotificationsReadAction = (): Promise<boolean> => performMarkAllNotificationsRead({ deps: actionDeps() });

export const deleteNotificationAction = (id: string): Promise<boolean> => performDeleteNotification({ id, deps: actionDeps() });

export const refreshNotificationsAction = (category: NotificationCategory): Promise<void> =>
  refreshNotifications(appQueryClient, apiDeps, category);
