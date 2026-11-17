import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { NOTIFICATION_CATEGORIES, categoryAccepts, type NotificationCategory } from '@/lib/notifications/categories';
import type { NotificationRecord } from '@/lib/notifications/record';

import {
  NOTIFICATIONS_QUERY_KEY,
  NOTIFICATION_COUNTS_QUERY_KEY,
  notificationListKey,
  type NotificationCounts,
  type NotificationsInfiniteData,
} from './notifications';

/**
 * **LES MUTATIONS DU CACHE DE LA CLOCHE** (#6288) — le SITE UNIQUE qui écrit
 * dans les listes par catégorie et dans le compte. Deux écrivains s'en
 * servent : le geste optimiste (`notifications-actions.ts`) et le temps réel
 * (`notifications-realtime.ts`). Écrites deux fois, la règle « une ligne lue
 * quitte « Non lues » » aurait divergé entre le tap et l'autre appareil.
 *
 * Chaque liste est RÉÉVALUÉE par `categoryAccepts` après la mutation : une
 * ligne qui cesse d'appartenir à sa catégorie en sort, jamais une ligne lue ne
 * reste sous « Non lues ». Une page inchangée garde son identité — les rangées
 * mémoïsées ne se re-rendent pas.
 */

type Matches = (notification: NotificationRecord) => boolean;

function mapNotifications(
  data: NotificationsInfiniteData,
  update: (notifications: readonly NotificationRecord[]) => readonly NotificationRecord[],
): NotificationsInfiniteData {
  let changed = false;
  const pages = data.pages.map((page) => {
    const notifications = update(page.notifications);
    const same = notifications.length === page.notifications.length && notifications.every((n, i) => n === page.notifications[i]);
    if (same) return page;
    changed = true;
    return { ...page, notifications };
  });
  return changed ? { ...data, pages } : data;
}

function updateLists(
  queryClient: QueryClient,
  update: (data: NotificationsInfiniteData, category: NotificationCategory) => NotificationsInfiniteData,
): void {
  for (const category of NOTIFICATION_CATEGORIES) {
    queryClient.setQueryData<NotificationsInfiniteData>(notificationListKey(category), (data) =>
      data === undefined ? data : update(data, category),
    );
  }
}

export function findNotification(queryClient: QueryClient, id: string): NotificationRecord | undefined {
  for (const category of NOTIFICATION_CATEGORIES) {
    const found = queryClient
      .getQueryData<NotificationsInfiniteData>(notificationListKey(category))
      ?.pages.flatMap((page) => page.notifications)
      .find((n) => n.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Les identifiants des lignes NON LUES en cache que `matches` retient, une fois chacun, toutes catégories confondues. */
export function unreadNotificationIds(queryClient: QueryClient, matches: Matches): readonly string[] {
  const rows = NOTIFICATION_CATEGORIES.flatMap(
    (category) => queryClient.getQueryData<NotificationsInfiniteData>(notificationListKey(category))?.pages.flatMap((page) => page.notifications) ?? [],
  );
  return [...new Set(rows.filter((n) => !n.state.isRead && matches(n)).map((n) => n.id))];
}

export function markNotificationsRead(queryClient: QueryClient, matches: Matches): void {
  updateLists(queryClient, (data, category) =>
    mapNotifications(data, (notifications) =>
      notifications.flatMap((n) => {
        if (n.state.isRead || !matches(n)) return [n];
        const readRow: NotificationRecord = { ...n, state: { ...n.state, isRead: true } };
        return categoryAccepts(category, readRow) ? [readRow] : [];
      }),
    ),
  );
}

export function removeNotifications(queryClient: QueryClient, matches: Matches): void {
  updateLists(queryClient, (data) => mapNotifications(data, (notifications) => notifications.filter((n) => !matches(n))));
}

/** Insère EN TÊTE de la première page de chaque catégorie qui l'accepte — une
 * liste jamais chargée n'est pas créée : elle se chargera à sa première ouverture. */
export function prependNotification(queryClient: QueryClient, notification: NotificationRecord): void {
  updateLists(queryClient, (data, category) => {
    if (!categoryAccepts(category, notification)) return data;
    const [first, ...rest] = data.pages;
    if (first === undefined || first.notifications.some((n) => n.id === notification.id)) return data;
    return { ...data, pages: [{ ...first, notifications: [notification, ...first.notifications] }, ...rest] };
  });
}

/**
 * Range une notification RÉÉCRITE à son rang `createdAt`, dans la page chargée qui le contient, pour chaque catégorie
 * qui l'accepte (#18907) : l'éditer ne la fait ni remonter en tête de la cloche, ni disparaître d'une page suivante
 * déjà chargée. Plus ancienne que toutes les pages chargées alors qu'il en reste à lire, elle appartient à une page
 * non chargée — qui se relira, les listes étant marquées périmées — et n'est pas insérée.
 */
export function insertNotificationByCreatedAt(queryClient: QueryClient, notification: NotificationRecord): void {
  const rank = Date.parse(notification.state.createdAt);
  updateLists(queryClient, (data, category) => {
    if (!categoryAccepts(category, notification)) return data;
    if (data.pages.some((page) => page.notifications.some((n) => n.id === notification.id))) return data;
    const slot = rankSlot(data.pages, rank);
    if (slot === null) return data;
    const pages = data.pages.map((page, p) =>
      p === slot.page ? { ...page, notifications: [...page.notifications.slice(0, slot.index), notification, ...page.notifications.slice(slot.index)] } : page,
    );
    return { ...data, pages };
  });
}

type Page = NotificationsInfiniteData['pages'][number];

function rankSlot(pages: readonly Page[], rank: number): { readonly page: number; readonly index: number } | null {
  if (pages.length === 0) return null;
  if (Number.isNaN(rank)) return { page: 0, index: 0 };
  const slot = pages
    .map((page, p) => ({ page: p, index: page.notifications.findIndex((n) => Date.parse(n.state.createdAt) <= rank) }))
    .find(({ index }) => index !== -1);
  if (slot !== undefined) return slot;
  const last = pages.length - 1;
  const lastPage = pages[last];
  return lastPage === undefined || lastPage.hasMore ? null : { page: last, index: lastPage.notifications.length };
}

/**
 * Rend à UNE ligne son état non lu, à sa place (#18907) — le retour arrière CIBLÉ de la lecture à l'arrivée, qui ne
 * restaure jamais l'instantané de toute la cloche : un instantané pris avant un POST lent effacerait ce qui est arrivé
 * pendant (une notification d'une autre conversation, une suppression). La ligne non lue revient dans chaque catégorie
 * qui l'accepte — « Non lues » comprise, qu'elle avait quittée —, à son rang `createdAt`.
 */
export function restoreNotificationUnread(queryClient: QueryClient, notification: NotificationRecord): void {
  const unread: NotificationRecord = { ...notification, state: { ...notification.state, isRead: false } };
  updateLists(queryClient, (data) => mapNotifications(data, (rows) => rows.map((n) => (n.id === unread.id && n.state.isRead ? unread : n))));
  insertNotificationByCreatedAt(queryClient, unread);
}

/** `ofType` : le type des lignes que `total` compte — `byType` compte, comme la passerelle, TOUTES les lignes d'un type, lues ou non. */
export function adjustNotificationCounts(
  queryClient: QueryClient,
  delta: { readonly unread?: number; readonly total?: number; readonly ofType?: string },
): void {
  const byTypeOf = (counts: NotificationCounts): NotificationCounts['byType'] =>
    delta.ofType === undefined
      ? counts.byType
      : { ...counts.byType, [delta.ofType]: Math.max(0, (counts.byType[delta.ofType] ?? 0) + (delta.total ?? 0)) };
  queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, (counts) =>
    counts === undefined
      ? counts
      : {
          ...counts,
          unread: Math.max(0, counts.unread + (delta.unread ?? 0)),
          total: Math.max(0, counts.total + (delta.total ?? 0)),
          byType: byTypeOf(counts),
        },
  );
}

export function replaceNotificationCounts(queryClient: QueryClient, counts: NotificationCounts, options: { readonly keepByType: boolean }): void {
  queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, (previous) =>
    options.keepByType && previous !== undefined ? { ...counts, byType: previous.byType } : counts,
  );
}

export type NotificationsSnapshot = ReadonlyArray<readonly [QueryKey, unknown]>;

/** L'instantané du retour arrière : TOUTES les listes et le compte, pris AVANT le geste. */
export function snapshotNotifications(queryClient: QueryClient): NotificationsSnapshot {
  return queryClient.getQueriesData({ queryKey: NOTIFICATIONS_QUERY_KEY });
}

export function restoreNotifications(queryClient: QueryClient, snapshot: NotificationsSnapshot): void {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}
