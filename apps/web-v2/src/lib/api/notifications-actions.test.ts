import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { NotificationRecord } from '@/lib/notifications/record';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  NOTIFICATION_COUNTS_QUERY_KEY,
  notificationListKey,
  type NotificationCounts,
  type NotificationsInfiniteData,
} from './notifications';
import {
  performDeleteNotification,
  performMarkAllNotificationsRead,
  performMarkNotificationRead,
} from './notifications-actions';

/**
 * LE MARQUAGE OPTIMISTE (#6288) — le compte bouge AVANT la réponse, et revient
 * si la passerelle refuse. Instant App (CLAUDE.md § Optimistic Updates) :
 * instantané → application locale → réseau → retour arrière sur échec.
 */

const record = (id: string, isRead: boolean, type = 'new_message'): NotificationRecord => ({
  id,
  type,
  title: null,
  content: id,
  actor: null,
  context: {},
  metadata: {},
  state: { isRead, createdAt: '2026-09-13T08:00:00.000Z' },
});

const page = (notifications: readonly NotificationRecord[]): NotificationsInfiniteData => ({
  pages: [{ notifications, hasMore: false, nextCursor: null }],
  pageParams: [undefined],
});

const seeded = (): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(notificationListKey('all'), page([record('n1', false), record('n2', false), record('n3', true)]));
  queryClient.setQueryData(notificationListKey('unread'), page([record('n1', false), record('n2', false)]));
  queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 3, unread: 2, byType: {} });
  return queryClient;
};

const ids = (queryClient: QueryClient, category: 'all' | 'unread') =>
  queryClient.getQueryData<NotificationsInfiniteData>(notificationListKey(category))?.pages.flatMap((p) => p.notifications.map((n) => n.id));

const readState = (queryClient: QueryClient, id: string) =>
  queryClient
    .getQueryData<NotificationsInfiniteData>(notificationListKey('all'))
    ?.pages.flatMap((p) => p.notifications)
    .find((n) => n.id === id)?.state.isRead;

const unread = (queryClient: QueryClient) => queryClient.getQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY)?.unread;

const suspended = () => {
  let release: (result: ApiResult<unknown>) => void = () => undefined;
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return new Promise<ApiResult<unknown>>((resolve) => (release = resolve));
    },
  } as unknown as HttpTransport;
  return { transport, requests, release: (result: ApiResult<unknown>) => release(result) };
};

describe('marquer UNE notification lue', () => {
  test('le compte baisse et la ligne passe lue AVANT la réponse ; elle quitte « Non lues »', async () => {
    const queryClient = seeded();
    const { transport, release } = suspended();

    const pending = performMarkNotificationRead({ id: 'n1', deps: { source: 'gateway', transport, queryClient } });

    expect(unread(queryClient)).toBe(1);
    expect(readState(queryClient, 'n1')).toBe(true);
    expect(ids(queryClient, 'unread')).toEqual(['n2']);

    release({ ok: true, data: undefined });
    expect(await pending).toBe(true);
    expect(unread(queryClient)).toBe(1);
  });

  test('un 4xx RÉTABLIT le compte, l’état de la ligne et sa place sous « Non lues »', async () => {
    const queryClient = seeded();
    const { transport, release } = suspended();

    const pending = performMarkNotificationRead({ id: 'n1', deps: { source: 'gateway', transport, queryClient } });
    release({ ok: false, status: 404, error: 'Notification not found' });

    expect(await pending).toBe(false);
    expect(unread(queryClient)).toBe(2);
    expect(readState(queryClient, 'n1')).toBe(false);
    expect(ids(queryClient, 'unread')).toEqual(['n1', 'n2']);
  });

  test('une ligne DÉJÀ lue ne coûte ni requête ni décrément', async () => {
    const queryClient = seeded();
    const { transport, requests } = suspended();

    expect(await performMarkNotificationRead({ id: 'n3', deps: { source: 'gateway', transport, queryClient } })).toBe(true);
    expect(requests).toHaveLength(0);
    expect(unread(queryClient)).toBe(2);
  });

  test('le compte ne descend jamais sous zéro', async () => {
    const queryClient = seeded();
    queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 3, unread: 0, byType: {} });
    const { transport, release } = suspended();
    const pending = performMarkNotificationRead({ id: 'n1', deps: { source: 'gateway', transport, queryClient } });
    expect(unread(queryClient)).toBe(0);
    release({ ok: true, data: undefined });
    await pending;
  });
});

describe('tout marquer lu', () => {
  test('tout passe lu et le compte tombe à zéro avant la réponse ; un échec rétablit tout', async () => {
    const queryClient = seeded();
    const { transport, release, requests } = suspended();

    const pending = performMarkAllNotificationsRead({ deps: { source: 'gateway', transport, queryClient } });
    expect(unread(queryClient)).toBe(0);
    expect(ids(queryClient, 'unread')).toEqual([]);
    expect(readState(queryClient, 'n2')).toBe(true);
    expect(requests[0]?.path).toBe('/api/v1/notifications/read-all');

    release({ ok: false, status: 500, error: 'boom' });
    expect(await pending).toBe(false);
    expect(unread(queryClient)).toBe(2);
    expect(ids(queryClient, 'unread')).toEqual(['n1', 'n2']);
    expect(readState(queryClient, 'n2')).toBe(false);
  });
});

describe('supprimer', () => {
  test('la ligne disparaît partout, le compte baisse si elle était non lue ; un refus la rend', async () => {
    const queryClient = seeded();
    const { transport, release, requests } = suspended();

    const pending = performDeleteNotification({ id: 'n2', deps: { source: 'gateway', transport, queryClient } });
    expect(ids(queryClient, 'all')).toEqual(['n1', 'n3']);
    expect(ids(queryClient, 'unread')).toEqual(['n1']);
    expect(unread(queryClient)).toBe(1);
    expect(`${requests[0]?.method} ${requests[0]?.path}`).toBe('DELETE /api/v1/notifications/n2');

    release({ ok: false, status: 403, error: 'Access denied' });
    expect(await pending).toBe(false);
    expect(ids(queryClient, 'all')).toEqual(['n1', 'n2', 'n3']);
    expect(unread(queryClient)).toBe(2);
  });

  test('supprimer une ligne LUE ne touche pas au compte', async () => {
    const queryClient = seeded();
    const { transport, release } = suspended();
    const pending = performDeleteNotification({ id: 'n3', deps: { source: 'gateway', transport, queryClient } });
    expect(unread(queryClient)).toBe(2);
    release({ ok: true, data: undefined });
    expect(await pending).toBe(true);
  });
});
