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
  followNotificationsOfTypeRead,
  performDeleteNotification,
  performMarkAllNotificationsRead,
  performMarkNotificationRead,
  performMarkNotificationsOfTypeRead,
} from './notifications-actions';
import { applyNotificationCounts, applyNotificationNew } from './notifications-realtime';

/**
 * LE MARQUAGE OPTIMISTE (#6288) — le compte bouge AVANT la réponse, et revient
 * si la passerelle refuse. Instant App (CLAUDE.md § Optimistic Updates) :
 * instantané → application locale → réseau → retour arrière sur échec.
 */

/* Une demande d'ami se RELIT : elle reste sous « Toutes » une fois lue — le
   message consommé, lui, en sort (#8960, témoin dédié plus bas). */
const record = (id: string, isRead: boolean, type = 'friend_request'): NotificationRecord => ({
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

describe('un message lu est CONSOMMÉ (#8960)', () => {
  test('il quitte « Toutes » avant la réponse, et y revient si la passerelle refuse', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationListKey('all'), page([record('m1', false, 'new_message'), record('f1', false)]));
    const { transport, release } = suspended();

    const pending = performMarkNotificationRead({ id: 'm1', deps: { source: 'gateway', transport, queryClient } });
    expect(ids(queryClient, 'all')).toEqual(['f1']);

    release({ ok: false, status: 500, error: 'boom' });
    expect(await pending).toBe(false);
    expect(ids(queryClient, 'all')).toEqual(['m1', 'f1']);
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

/* LE CARNET OUVERT ÉTEINT SA NOTIFICATION (#10175, § 5.16.4) : la ligne « moments à immortaliser » de la cloche
   passe lue quand le carnet s'ouvre, sans toucher aux autres notifications non lues. Le push ne part que pour un
   compte HORS LIGNE : le tap ouvre le carnet À FROID, la ligne n'est dans aucune liste en cache — c'est la passerelle,
   pas le cache, qui sait quelles lignes éteindre (`POST /notifications/read-by-types`). */
describe('marquer lues les notifications d’un TYPE', () => {
  const photoSeeded = (): QueryClient => {
    const queryClient = new QueryClient();
    const rows = [record('p1', false, 'game_photo_moment'), record('n1', false), record('p2', false, 'game_photo_moment'), record('p0', true, 'game_photo_moment')];
    queryClient.setQueryData(notificationListKey('all'), page(rows));
    queryClient.setQueryData(notificationListKey('unread'), page(rows.filter((row) => !row.state.isRead)));
    queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 4, unread: 3, byType: {} });
    return queryClient;
  };
  const coldStart = (): QueryClient => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 1, unread: 1, byType: { game_photo_moment: 1 } });
    return queryClient;
  };
  const answering = (result: ApiResult<unknown>) => {
    const requests: HttpRequest[] = [];
    const transport = { request: async (req: HttpRequest) => (requests.push(req), result) } as unknown as HttpTransport;
    return { transport, requests };
  };
  const sent = (requests: readonly HttpRequest[]) => requests.map((req) => ({ call: `${req.method} ${req.path}`, body: req.body }));
  const READ_BY_TYPE = { call: 'POST /api/v1/notifications/read-by-types', body: { types: ['game_photo_moment'] } };

  test('carnet ouvert à froid (aucune liste en cache, la cloche compte une non-lue) : UNE requête read-by-types', async () => {
    const queryClient = coldStart();
    const { transport, requests } = answering({ ok: true, data: undefined });
    expect(await performMarkNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } })).toBe(true);
    expect(sent(requests)).toEqual([READ_BY_TYPE]);
  });

  test('confirmé : le compte de la cloche est relu, la passerelle seule sachant combien de lignes elle a éteintes', async () => {
    const queryClient = coldStart();
    const { transport } = answering({ ok: true, data: undefined });
    await performMarkNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } });
    expect(queryClient.getQueryState(NOTIFICATION_COUNTS_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  test('les lignes en cache de ce type passent lues AVANT la réponse, toutes par UNE requête ; le reste ne bouge pas', async () => {
    const queryClient = photoSeeded();
    const { transport, requests, release } = suspended();
    const pending = performMarkNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } });

    expect(readState(queryClient, 'p1')).toBe(true);
    expect(readState(queryClient, 'p2')).toBe(true);
    expect(readState(queryClient, 'n1')).toBe(false);
    expect(ids(queryClient, 'unread')).toEqual(['n1']);
    expect(unread(queryClient)).toBe(1);
    expect(sent(requests)).toEqual([READ_BY_TYPE]);

    release({ ok: true, data: undefined });
    expect(await pending).toBe(true);
    expect(requests).toHaveLength(1);
  });

  test('un refus rétablit les lignes, leur place sous « Non lues » et le compte', async () => {
    const queryClient = photoSeeded();
    const { transport } = answering({ ok: false, status: 500, error: 'boom' });
    expect(await performMarkNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } })).toBe(false);
    expect(readState(queryClient, 'p1')).toBe(false);
    expect(ids(queryClient, 'unread')).toEqual(['p1', 'n1', 'p2']);
    expect(unread(queryClient)).toBe(3);
  });

  test('compte inconnu et rien en cache : la requête part quand même — ne rien savoir n’est pas savoir qu’il n’y a rien', async () => {
    const queryClient = new QueryClient();
    const { transport, requests } = answering({ ok: true, data: undefined });
    await performMarkNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } });
    expect(sent(requests)).toEqual([READ_BY_TYPE]);
  });

  test('la cloche ne compte AUCUNE non-lue et aucune ligne de ce type en cache : aucune requête', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationListKey('all'), page([record('n3', true)]));
    queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 1, unread: 0, byType: {} });
    const { transport, requests } = answering({ ok: true, data: undefined });
    expect(await performMarkNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } })).toBe(true);
    expect(requests).toEqual([]);
  });
});

/* LE CARNET RESTE OUVERT (#10175) : une ligne « moments à immortaliser » arrivée pendant qu'il est à l'écran (la
   fenêtre visible, le service worker se tait) s'éteint aussi — jamais en boucle sur un refus ni sur sa propre
   confirmation, et plus rien une fois l'écran quitté. */
describe('suivre les notifications d’un TYPE tant que l’écran est ouvert', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const opened = (unreadCount: number): QueryClient => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: unreadCount, unread: unreadCount, byType: {} });
    return queryClient;
  };
  const counting = (result: ApiResult<unknown>) => {
    const requests: HttpRequest[] = [];
    const transport = { request: async (req: HttpRequest) => (requests.push(req), result) } as unknown as HttpTransport;
    return { transport, requests };
  };

  test('à l’ouverture, puis à chaque non-lue de ce type arrivée pendant l’ouverture : une requête de plus', async () => {
    const queryClient = opened(1);
    const { transport, requests } = counting({ ok: true, data: undefined });
    const stop = followNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } });
    await tick();
    expect(requests).toHaveLength(1);

    applyNotificationNew(queryClient, record('p9', false, 'game_photo_moment'));
    await tick();
    expect(requests).toHaveLength(2);
    expect(requests[1]?.path).toBe('/api/v1/notifications/read-by-types');
    stop();
  });

  test('sa propre confirmation (le compte relu à la baisse) ne relance rien', async () => {
    const queryClient = opened(2);
    const { transport, requests } = counting({ ok: true, data: undefined });
    const stop = followNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } });
    await tick();
    queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 1, unread: 1, byType: {} });
    await tick();
    expect(requests).toHaveLength(1);
    stop();
  });

  test('un refus ne relance pas en boucle : le retour arrière n’est pas une arrivée', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationListKey('all'), page([record('p1', false, 'game_photo_moment')]));
    queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 1, unread: 1, byType: {} });
    const { transport, requests } = counting({ ok: false, status: 500, error: 'boom' });
    const stop = followNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } });
    await tick();
    await tick();
    expect(requests).toHaveLength(1);
    expect(readState(queryClient, 'p1')).toBe(false);
    stop();
  });

  test('rien à éteindre à l’ouverture : aucune requête ; une non-lue de ce type arrive ensuite : une requête', async () => {
    const queryClient = opened(0);
    const { transport, requests } = counting({ ok: true, data: undefined });
    const stop = followNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } });
    await tick();
    expect(requests).toHaveLength(0);
    applyNotificationNew(queryClient, record('p9', false, 'game_photo_moment'));
    await tick();
    expect(requests).toHaveLength(1);
    stop();
  });

  test('une notification d’un AUTRE type arrive carnet ouvert : aucune requête — seul ce type relance le suivi', async () => {
    const queryClient = opened(1);
    const { transport, requests } = counting({ ok: true, data: undefined });
    const stop = followNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } });
    await tick();
    expect(requests).toHaveLength(1);

    applyNotificationNew(queryClient, record('m1', false, 'new_message'));
    await tick();
    applyNotificationCounts(queryClient, { total: 5, unread: 4 });
    await tick();
    expect(requests).toHaveLength(1);
    stop();
  });

  test('l’écran quitté : plus aucune requête', async () => {
    const queryClient = opened(1);
    const { transport, requests } = counting({ ok: true, data: undefined });
    const stop = followNotificationsOfTypeRead({ type: 'game_photo_moment', deps: { source: 'gateway', transport, queryClient } });
    await tick();
    stop();
    applyNotificationNew(queryClient, record('p9', false, 'game_photo_moment'));
    await tick();
    expect(requests).toHaveLength(1);
  });
});
