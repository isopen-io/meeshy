import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import type { NotificationRecord } from '@/lib/notifications/record';
import { createOutboxStore } from '@/lib/send/outbox-store';

import {
  NOTIFICATION_COUNTS_QUERY_KEY,
  notificationListKey,
  type NotificationCounts,
  type NotificationsInfiniteData,
} from './notifications';
import { createRealtimeConnection } from './socket';
import { createTypingStore } from './typing-store';

/**
 * LES ÉVÉNEMENTS `notification:*` APPLIQUÉS AU CACHE (#6288) — par la VRAIE
 * connexion (`createRealtimeConnection`), sur un faux socket : ce qui est gardé
 * est le CÂBLAGE autant que la loi. Aucun `queryFn` n'est posé sur le cache :
 * la moindre relecture réseau lèverait, et `isFetching()` le dirait.
 */

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  return {
    get connected() {
      return connected;
    },
    connect: () => {
      connected = true;
    },
    disconnect: () => {
      connected = false;
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
    fire: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

const record = (id: string, isRead: boolean, partial: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id,
  type: 'new_message',
  title: null,
  content: id,
  actor: null,
  context: {},
  metadata: {},
  state: { isRead, createdAt: '2026-09-13T08:00:00.000Z' },
  ...partial,
});

const page = (notifications: readonly NotificationRecord[]): NotificationsInfiniteData => ({
  pages: [{ notifications, hasMore: false, nextCursor: null }],
  pageParams: [undefined],
});

function connect() {
  const socket = fakeSocket();
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    notificationListKey('all'),
    page([
      record('n1', false, { context: { conversationId: 'c-a' } }),
      record('n2', true, { type: 'user_mentioned', context: { conversationId: 'c-b' } }),
    ]),
  );
  queryClient.setQueryData(notificationListKey('unread'), page([record('n1', false, { context: { conversationId: 'c-a' } })]));
  queryClient.setQueryData(notificationListKey('mentions'), page([record('n2', true, { type: 'user_mentioned' })]));
  queryClient.setQueryData(notificationListKey('calls'), page([]));
  queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 2, unread: 1, byType: {} });

  createRealtimeConnection(
    { token: 't', sessionToken: 's' },
    {
      base: 'https://gate.staging.meeshy.me',
      socketFactory: () => socket,
      queryClient,
      typing: createTypingStore(),
      conversationStore,
      outbox: createOutboxStore(),
      viewerId: () => 'u-viewer',
      onClearSession: () => undefined,
    },
  );
  return { socket, queryClient };
}

const ids = (queryClient: QueryClient, category: Parameters<typeof notificationListKey>[0]) =>
  queryClient.getQueryData<NotificationsInfiniteData>(notificationListKey(category))?.pages.flatMap((p) => p.notifications.map((n) => n.id));

const counts = (queryClient: QueryClient) => queryClient.getQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY);

const servie = (id: string, type: string) => ({
  id,
  userId: 'u-viewer',
  type,
  priority: 'normal',
  title: 'Kwame',
  content: 'Tu peux relire ?',
  actor: { id: 'u-kwame', username: 'kwame', displayName: 'Kwame' },
  context: { conversationId: 'c-a' },
  metadata: {},
  state: { isRead: false, readAt: null, createdAt: '2026-09-13T09:00:00.000Z' },
  _seq: 12,
});

describe('notification:new', () => {
  test('incrémente le compte et insère la ligne EN TÊTE, sans relecture réseau', () => {
    const { socket, queryClient } = connect();

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, servie('n9', 'user_mentioned'));

    expect(counts(queryClient)?.unread).toBe(2);
    expect(ids(queryClient, 'all')).toEqual(['n9', 'n1', 'n2']);
    expect(ids(queryClient, 'unread')).toEqual(['n9', 'n1']);
    expect(ids(queryClient, 'mentions')).toEqual(['n9', 'n2']);
    expect(ids(queryClient, 'calls')).toEqual([]);
    expect(queryClient.isFetching()).toBe(0);
  });

  test('la même notification reçue deux fois ne compte qu’une fois', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, servie('n9', 'new_message'));
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, servie('n9', 'new_message'));
    expect(counts(queryClient)?.unread).toBe(2);
    expect(ids(queryClient, 'all')).toEqual(['n9', 'n1', 'n2']);
  });

  test('une charge illisible est ignorée, jamais une exception', () => {
    const { socket, queryClient } = connect();
    expect(() => socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, { id: 'n9' })).not.toThrow();
    expect(counts(queryClient)?.unread).toBe(1);
  });
});

describe('notification:read et notification:read-bulk', () => {
  test('une ligne lue ailleurs passe lue et quitte « Non lues » — le compte attend `notification:counts`', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_READ, { notificationId: 'n1' });

    const all = queryClient.getQueryData<NotificationsInfiniteData>(notificationListKey('all'));
    expect(all?.pages[0]?.notifications.find((n) => n.id === 'n1')?.state.isRead).toBe(true);
    expect(ids(queryClient, 'unread')).toEqual([]);
    expect(counts(queryClient)?.unread).toBe(1);
  });

  test('le prédicat d’un marquage en masse est REJOUÉ par la loi partagée', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_READ_BULK, {
      scope: { kind: 'context', contextKey: 'conversationId', contextValue: 'c-a' },
    });
    expect(ids(queryClient, 'unread')).toEqual([]);
  });

  test('un scope inconnu ne marque RIEN', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_READ_BULK, { scope: { kind: 'demain' } });
    expect(ids(queryClient, 'unread')).toEqual(['n1']);
  });
});

describe('notification:deleted et notification:deleted-bulk', () => {
  test('une ligne supprimée ailleurs disparaît de toutes les catégories', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n2' });
    expect(ids(queryClient, 'all')).toEqual(['n1']);
    expect(ids(queryClient, 'mentions')).toEqual([]);
  });

  test('la purge des lues retire les lues, garde les non-lues', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED_BULK, { scope: { kind: 'read' } });
    expect(ids(queryClient, 'all')).toEqual(['n1']);
    expect(counts(queryClient)?.unread).toBe(1);
  });
});

describe('notification:counts', () => {
  test('le compte serveur REMPLACE le compte local', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_COUNTS, { total: 40, unread: 7 });
    expect(counts(queryClient)).toEqual({ total: 40, unread: 7, byType: {} });
  });

  test('un compte illisible est ignoré', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_COUNTS, { unread: 'sept' });
    expect(counts(queryClient)?.unread).toBe(1);
  });
});

describe('la reconnexion rejoue la cloche', () => {
  test('une seconde authentification marque les notifications périmées', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.AUTHENTICATED, {});
    expect(queryClient.getQueryState(NOTIFICATION_COUNTS_QUERY_KEY)?.isInvalidated).toBe(false);
    socket.fire(SERVER_EVENTS.AUTHENTICATED, {});
    expect(queryClient.getQueryState(NOTIFICATION_COUNTS_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(notificationListKey('all'))?.isInvalidated).toBe(true);
  });
});
