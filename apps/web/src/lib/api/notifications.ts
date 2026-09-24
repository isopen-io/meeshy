import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { categoryQuery, type NotificationCategory } from '@/lib/notifications/categories';
import { decodeNotifications, type NotificationRecord } from '@/lib/notifications/record';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES NOTIFICATIONS** (#6288) — `services/gateway/src/routes/notifications.ts`.
 * `source` résolue ICI, jamais dans l'écran (motif `conversations.ts`) : les
 * fixtures sont servies par le MÊME chemin.
 *
 * - `GET /notifications?limit=30[&types=…|&unreadOnly=true][&cursor=…]` — AU
 *   CURSEUR : `offset` absent retire le `count()` complet du chemin nominal dès
 *   la première page (`:152-170`). Une catégorie est un filtre SERVEUR
 *   (`lib/notifications/categories.ts`), chacune sa liste en cache.
 * - `GET /notifications/counts` — le compte de non-lus. **Pas
 *   `/unread-count`** : celui-ci répond `{ success, count }` HORS de `data`, et
 *   le pont unique `http.ts` ne lit que `data`. Il y aurait rendu `undefined`,
 *   et une pastille à zéro pour toujours. `/counts` passe par `sendSuccess`,
 *   applique le MÊME prédicat de visibilité que la liste, et sert la MÊME forme
 *   que l'événement `notification:counts` — une seule loi de décodage pour les
 *   deux voies.
 * - `POST /notifications/:id/read`, `POST /notifications/read-all`,
 *   `DELETE /notifications/:id`.
 */

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;
export const NOTIFICATION_LISTS_KEY = ['notifications', 'list'] as const;
export const notificationListKey = (category: NotificationCategory) => ['notifications', 'list', category] as const;
export const NOTIFICATION_COUNTS_QUERY_KEY = ['notifications', 'counts'] as const;

/** La page d'iOS (`NotificationListViewModel.limit`). */
export const NOTIFICATIONS_PAGE_SIZE = 30;

export type NotificationsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type NotificationsPage = {
  readonly notifications: readonly NotificationRecord[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type NotificationsPageParam = string | undefined;

export type NotificationsInfiniteData = InfiniteData<NotificationsPage, NotificationsPageParam>;

export type NotificationCounts = {
  readonly total: number;
  readonly unread: number;
  readonly byType: Readonly<Record<string, number>>;
};

/** `cursorPaginationSchema` côté passerelle — PAS `PaginationMeta`, malgré le
 * typage large de `ApiSuccess.pagination` (même recadrage que `feed.ts`). */
type RawCursorPagination = { readonly hasMore?: boolean; readonly nextCursor?: string | null };

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function decodeNotificationCounts(raw: unknown): NotificationCounts | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const counts = raw as Readonly<Record<string, unknown>>;
  if (!isCount(counts.total) || !isCount(counts.unread)) return null;
  const byType =
    typeof counts.byType === 'object' && counts.byType !== null
      ? Object.fromEntries(Object.entries(counts.byType).filter((entry): entry is [string, number] => isCount(entry[1])))
      : {};
  return { total: counts.total, unread: counts.unread, byType };
}

export async function loadNotificationsPage(
  params: NotificationsDeps & {
    readonly category: NotificationCategory;
    readonly cursor?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<NotificationsPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureNotificationsPage } = await import('./fixtures-notifications');
    return {
      ok: true,
      data: fixtureNotificationsPage({
        category: params.category,
        limit: NOTIFICATIONS_PAGE_SIZE,
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
      }),
    };
  }
  const { types, unreadOnly } = categoryQuery(params.category);
  const query = new URLSearchParams({
    limit: String(NOTIFICATIONS_PAGE_SIZE),
    ...(types === undefined ? {} : { types }),
    ...(unreadOnly === undefined ? {} : { unreadOnly: 'true' }),
    ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
  });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/notifications?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const pagination = result.pagination as unknown as RawCursorPagination | undefined;
  const nextCursor = pagination?.nextCursor ?? null;
  return {
    ok: true,
    data: {
      notifications: decodeNotifications(result.data),
      hasMore: pagination?.hasMore === true && nextCursor !== null,
      nextCursor,
    },
  };
}

export async function loadNotificationCounts(
  params: NotificationsDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<NotificationCounts>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureNotificationCounts } = await import('./fixtures-notifications');
    return { ok: true, data: fixtureNotificationCounts() };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: '/api/v1/notifications/counts',
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const counts = decodeNotificationCounts(result.data);
  return counts === null ? { ok: false, status: 0, error: 'Compte de notifications illisible' } : { ok: true, data: counts };
}

export async function postNotificationRead(deps: NotificationsDeps, id: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureMarkNotificationRead } = await import('./fixtures-notifications');
    return fixtureMarkNotificationRead(id);
  }
  return deps.transport.request({ method: 'POST', path: `/api/v1/notifications/${encodeURIComponent(id)}/read` });
}

export async function postAllNotificationsRead(deps: NotificationsDeps): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureMarkAllNotificationsRead } = await import('./fixtures-notifications');
    return fixtureMarkAllNotificationsRead();
  }
  return deps.transport.request({ method: 'POST', path: '/api/v1/notifications/read-all' });
}

export async function removeNotification(deps: NotificationsDeps, id: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureDeleteNotification } = await import('./fixtures-notifications');
    return fixtureDeleteNotification(id);
  }
  return deps.transport.request({ method: 'DELETE', path: `/api/v1/notifications/${encodeURIComponent(id)}` });
}

/** Aplatit les pages, dédoublonnées par id — la première occurrence gagne (une
 * ligne insérée en tête entre deux pages ne s'affiche pas deux fois). */
export function flattenNotificationPages(data: NotificationsInfiniteData): readonly NotificationRecord[] {
  const seen = new Set<string>();
  return data.pages.flatMap((page) =>
    page.notifications.filter((notification) => {
      if (seen.has(notification.id)) return false;
      seen.add(notification.id);
      return true;
    }),
  );
}

/** `getNextPageParam` — refuse tout curseur qui bouclerait : fin annoncée,
 * curseur absent, curseur STAGNANT, page vide. */
export function nextNotificationsCursor(
  lastPage: NotificationsPage,
  _allPages: readonly NotificationsPage[],
  lastPageParam: NotificationsPageParam,
): NotificationsPageParam {
  if (!lastPage.hasMore || lastPage.nextCursor === null) return undefined;
  if (lastPage.nextCursor === lastPageParam || lastPage.notifications.length === 0) return undefined;
  return lastPage.nextCursor;
}

export function notificationsInfiniteOptions(deps: NotificationsDeps, category: NotificationCategory) {
  return {
    queryKey: notificationListKey(category),
    queryFn: async ({ pageParam, signal }: { readonly pageParam?: NotificationsPageParam; readonly signal?: AbortSignal }) =>
      unwrap(
        await loadNotificationsPage({
          ...deps,
          category,
          ...(pageParam === undefined ? {} : { cursor: pageParam }),
          ...(signal === undefined ? {} : { signal }),
        }),
      ),
    initialPageParam: undefined as NotificationsPageParam,
    getNextPageParam: nextNotificationsCursor,
  };
}

export function notificationCountsQueryOptions(deps: NotificationsDeps) {
  return {
    queryKey: NOTIFICATION_COUNTS_QUERY_KEY,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadNotificationCounts({ ...deps, ...(signal === undefined ? {} : { signal }) })),
  };
}

/**
 * Le TIRER — la page 1 de la catégorie ouverte, curseur remis à zéro, et le
 * compte relu en parallèle. Un échec de la liste laisse `data` intact et
 * REJETTE (`usePullToRefresh` le traduit en `completing failed`).
 */
export function refreshNotifications(
  queryClient: QueryClient,
  deps: NotificationsDeps,
  category: NotificationCategory,
): Promise<void> {
  return Promise.all([
    queryClient.fetchInfiniteQuery({ ...notificationsInfiniteOptions(deps, category), pages: 1, staleTime: 0 }),
    queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_QUERY_KEY }),
  ]).then(() => undefined);
}
