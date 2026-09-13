import { afterEach, describe, expect, test } from 'bun:test';

import { resetFixtureNotificationsForTests } from './fixtures-notifications';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  NOTIFICATIONS_PAGE_SIZE,
  flattenNotificationPages,
  loadNotificationCounts,
  loadNotificationsPage,
  postAllNotificationsRead,
  postNotificationRead,
  removeNotification,
  type NotificationsInfiniteData,
} from './notifications';

/**
 * LE PORT DES NOTIFICATIONS (#6288) — `services/gateway/src/routes/notifications.ts`.
 *
 * Deux arbitrages que ces témoins gardent :
 *  - la page est demandée AU CURSEUR, sans `offset` : `offset` absent retire le
 *    `count()` complet du chemin nominal dès la première page (`:152-170`) ;
 *  - le compte de non-lus vient de `GET /notifications/counts`, jamais de
 *    `/unread-count` : ce dernier répond `{ success, count }` HORS de `data`,
 *    que le pont unique `http.ts` ne lit pas — il rendrait `undefined`.
 */

afterEach(() => resetFixtureNotificationsForTests());

const scripted = (respond: (req: HttpRequest) => Promise<ApiResult<unknown>>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return respond(req);
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

const ligne = (id: string, type = 'new_message') => ({
  id,
  userId: 'u-viewer',
  type,
  priority: 'normal',
  title: null,
  content: 'bonjour',
  context: {},
  metadata: {},
  state: { isRead: false, readAt: null, createdAt: '2026-09-13T08:00:00.000Z' },
  delivery: { emailSent: false, pushSent: false },
});

describe('loadNotificationsPage — la passerelle', () => {
  test('une catégorie de famille part en `types=`, au curseur, jamais en `offset`', async () => {
    const { requests, transport } = scripted(async () => ({
      ok: true,
      data: [ligne('n1', 'user_mentioned')],
      pagination: { limit: 30, hasMore: true, nextCursor: 'cur-2' } as never,
    }));

    const result = await loadNotificationsPage({ source: 'gateway', transport, category: 'mentions', cursor: 'cur-1' });

    const url = new URL(`https://x${requests[0]?.path ?? ''}`);
    expect(requests[0]?.method).toBe('GET');
    expect(url.pathname).toBe('/api/v1/notifications');
    expect(url.searchParams.get('limit')).toBe(String(NOTIFICATIONS_PAGE_SIZE));
    expect(url.searchParams.get('cursor')).toBe('cur-1');
    expect(url.searchParams.get('types')?.split(',').sort()).toEqual(['MENTION', 'mention', 'user_mentioned']);
    expect(url.searchParams.has('offset')).toBe(false);
    expect(result).toEqual({
      ok: true,
      data: {
        notifications: [
          {
            id: 'n1',
            type: 'user_mentioned',
            title: null,
            content: 'bonjour',
            actor: null,
            context: {},
            metadata: {},
            state: { isRead: false, createdAt: '2026-09-13T08:00:00.000Z' },
          },
        ],
        hasMore: true,
        nextCursor: 'cur-2',
      },
    });
  });

  test('« Non lues » part en `unreadOnly=true`, sans `types`', async () => {
    const { requests, transport } = scripted(async () => ({ ok: true, data: [] }));
    await loadNotificationsPage({ source: 'gateway', transport, category: 'unread' });
    const url = new URL(`https://x${requests[0]?.path ?? ''}`);
    expect(url.searchParams.get('unreadOnly')).toBe('true');
    expect(url.searchParams.has('types')).toBe(false);
    expect(url.searchParams.has('cursor')).toBe(false);
  });

  test('une pagination absente vaut « fin de liste », jamais une boucle', async () => {
    const { transport } = scripted(async () => ({ ok: true, data: [ligne('n1')] }));
    const result = await loadNotificationsPage({ source: 'gateway', transport, category: 'all' });
    expect(result.ok && result.data.hasMore).toBe(false);
    expect(result.ok && result.data.nextCursor).toBeNull();
  });

  test('un refus de la passerelle traverse tel quel', async () => {
    const { transport } = scripted(async () => ({ ok: false, status: 401, error: 'Unauthorized' }));
    expect(await loadNotificationsPage({ source: 'gateway', transport, category: 'all' })).toEqual({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    });
  });
});

describe('loadNotificationCounts — `GET /notifications/counts`', () => {
  test('rend `total`, `unread` et `byType`', async () => {
    const { requests, transport } = scripted(async () => ({
      ok: true,
      data: { total: 12, unread: 3, byType: { new_message: 5 } },
    }));
    expect(await loadNotificationCounts({ source: 'gateway', transport })).toEqual({
      ok: true,
      data: { total: 12, unread: 3, byType: { new_message: 5 } },
    });
    expect(requests[0]?.path).toBe('/api/v1/notifications/counts');
  });

  test('une réponse sans compte lisible est un ÉCHEC, jamais un zéro inventé', async () => {
    const { transport } = scripted(async () => ({ ok: true, data: { count: 3 } }));
    const result = await loadNotificationCounts({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
  });
});

describe('les trois écritures', () => {
  test('marquer une ligne, tout marquer, supprimer — les routes de la passerelle', async () => {
    const { requests, transport } = scripted(async () => ({ ok: true, data: undefined }));
    const deps = { source: 'gateway' as const, transport };

    await postNotificationRead(deps, 'n1');
    await postAllNotificationsRead(deps);
    await removeNotification(deps, 'n1');

    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/v1/notifications/n1/read',
      'POST /api/v1/notifications/read-all',
      'DELETE /api/v1/notifications/n1',
    ]);
  });
});

describe('les fixtures servent la MÊME loi', () => {
  const transport = {} as HttpTransport;

  test('trois non-lues, et « Non lues » n’en rend pas d’autre', async () => {
    const counts = await loadNotificationCounts({ source: 'fixtures', transport });
    const unread = await loadNotificationsPage({ source: 'fixtures', transport, category: 'unread' });
    expect(counts.ok && counts.data.unread).toBe(3);
    expect(unread.ok && unread.data.notifications.every((n) => !n.state.isRead)).toBe(true);
    expect(unread.ok && unread.data.notifications).toHaveLength(3);
  });

  test('une catégorie de famille ne rend que ses types', async () => {
    const page = await loadNotificationsPage({ source: 'fixtures', transport, category: 'mentions' });
    expect(page.ok && page.data.notifications.length).toBeGreaterThan(0);
    expect(page.ok && page.data.notifications.every((n) => n.type === 'user_mentioned' || n.type === 'mention')).toBe(true);
  });

  test('une catégorie sans ligne rend une page vide — l’état vide a de quoi se dessiner', async () => {
    const page = await loadNotificationsPage({ source: 'fixtures', transport, category: 'calls' });
    expect(page.ok && page.data.notifications).toEqual([]);
  });

  test('marquer lu côté fixtures fait baisser le compte que la page suivante relit', async () => {
    const first = await loadNotificationsPage({ source: 'fixtures', transport, category: 'unread' });
    const id = first.ok ? first.data.notifications[0]?.id : undefined;
    expect(id).toBeDefined();
    await postNotificationRead({ source: 'fixtures', transport }, id ?? '');
    const counts = await loadNotificationCounts({ source: 'fixtures', transport });
    expect(counts.ok && counts.data.unread).toBe(2);
  });
});

describe('flattenNotificationPages', () => {
  test('aplatit les pages et dédoublonne par id, la première occurrence gagne', () => {
    const record = (id: string, content: string) => ({
      id,
      type: 'new_message',
      title: null,
      content,
      actor: null,
      context: {},
      metadata: {},
      state: { isRead: false, createdAt: '2026-09-13T08:00:00.000Z' },
    });
    const data: NotificationsInfiniteData = {
      pages: [
        { notifications: [record('a', '1'), record('b', '2')], hasMore: true, nextCursor: 'c' },
        { notifications: [record('b', 'doublon'), record('c', '3')], hasMore: false, nextCursor: null },
      ],
      pageParams: [undefined, 'c'],
    };
    expect(flattenNotificationPages(data).map((n) => `${n.id}:${n.content}`)).toEqual(['a:1', 'b:2', 'c:3']);
  });
});
