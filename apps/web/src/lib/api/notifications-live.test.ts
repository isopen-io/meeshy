import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import { inAppBannerStore } from '@/lib/notifications/in-app-banner';
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
 * LA BANNIÈRE IN-APP ET LA CLOCHE SUIVENT LA PASSERELLE (#18907,
 * web-notifs-1, web-notifs-2) — par la VRAIE connexion, sur un faux socket.
 * Un onglet bun n'a ni `document` ni `window` : les témoins posent les deux
 * globaux que la connexion lit (onglet visible, chemin courant).
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

const served = (id: string, createdAt: string, content: string) => ({
  id,
  userId: 'u-viewer',
  type: 'new_message',
  priority: 'normal',
  title: 'Awa',
  content,
  actor: { id: 'u-awa', username: 'awa', displayName: 'Awa' },
  context: { conversationId: 'conv-1' },
  metadata: {},
  state: { isRead: false, readAt: null, createdAt },
});

function connect(options: { readonly now?: () => number } = {}) {
  const socket = fakeSocket();
  const queryClient = new QueryClient();
  const empty: NotificationsInfiniteData = { pages: [{ notifications: [], hasMore: false, nextCursor: null }], pageParams: [undefined] };
  queryClient.setQueryData(notificationListKey('all'), empty);
  queryClient.setQueryData(notificationListKey('unread'), empty);
  queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 0, unread: 0, byType: {} });
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
      ...options,
    },
  );
  return { socket, queryClient };
}

const ids = (queryClient: QueryClient) =>
  queryClient.getQueryData<NotificationsInfiniteData>(notificationListKey('all'))?.pages.flatMap((p) => p.notifications.map((n) => n.id));

const unread = (queryClient: QueryClient) => queryClient.getQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY)?.unread;

const bannerId = () => inAppBannerStore.getState().current?.id ?? null;

const globals = globalThis as { document?: unknown; window?: unknown };
let saved: { readonly document: unknown; readonly window: unknown };

beforeEach(() => {
  saved = { document: globals.document, window: globals.window };
  globals.document = { hidden: false };
  globals.window = { location: { pathname: '/' }, addEventListener: () => undefined, removeEventListener: () => undefined };
  inAppBannerStore.setState({ current: null });
});

afterEach(() => {
  globals.document = saved.document;
  globals.window = saved.window;
  inAppBannerStore.setState({ current: null });
});

describe('web-notifs-1 — la bannière d’une notification retirée disparaît avec elle', () => {
  test('un message supprimé pour tous retire sa bannière à l’écran', () => {
    const { socket } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Écoute ce vocal'));
    expect(bannerId()).toBe('n1');

    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n1' });

    expect(bannerId()).toBeNull();
  });

  test('la suppression d’une AUTRE notification laisse la bannière affichée', () => {
    const { socket } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Écoute ce vocal'));

    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n2' });

    expect(bannerId()).toBe('n1');
  });
});

describe('web-notifs-2 — une notification ÉDITÉE (deleted puis new, même id) est une réécriture, pas une arrivée', () => {
  test('la bannière déjà vue puis fermée ne redescend pas, et la ligne garde son rang dans la cloche', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 17h'));
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n2', '2026-11-17T09:00:00.000Z', 'Tu es là ?'));
    inAppBannerStore.getState().dismiss();

    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n1' });
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 18h'));

    expect(bannerId()).toBeNull();
    expect(ids(queryClient)).toEqual(['n2', 'n1']);
    const rewritten = queryClient.getQueryData<NotificationsInfiniteData>(notificationListKey('all'))?.pages[0]?.notifications.find((n) => n.id === 'n1');
    expect(rewritten?.content).toBe('Rendez-vous à 18h');
  });

  test('la bannière encore affichée à la suppression est remplacée par le texte édité', () => {
    const { socket } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 17h'));
    expect(bannerId()).toBe('n1');

    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n1' });
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 18h'));

    expect(inAppBannerStore.getState().current?.content).toBe('Rendez-vous à 18h');
  });

  test('une réécriture ne compte pas une seconde fois dans la pastille', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 17h'));
    expect(unread(queryClient)).toBe(1);

    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n1' });
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 18h'));

    expect(unread(queryClient)).toBe(1);
  });

  test('un new du même id APRÈS la fenêtre n’est plus une réécriture : la bannière descend', () => {
    let clock = 0;
    const { socket } = connect({ now: () => clock });
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 17h'));
    inAppBannerStore.getState().dismiss();
    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n1' });

    clock = 6_000;
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 18h'));

    expect(bannerId()).toBe('n1');
  });

  test('une bannière d’une AUTRE notification, posée entre-temps, n’est pas écrasée par la réécriture', () => {
    const { socket } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 17h'));
    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n1' });
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n3', '2026-11-17T10:00:00.000Z', 'Autre chose'));

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T08:00:00.000Z', 'Rendez-vous à 18h'));

    expect(bannerId()).toBe('n3');
  });
});
