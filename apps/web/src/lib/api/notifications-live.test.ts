import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import { inAppBannerStore } from '@/lib/notifications/in-app-banner';
import type { NotificationRecord } from '@/lib/notifications/record';
import { createOutboxStore } from '@/lib/send/outbox-store';

import type { ApiResult, HttpRequest, HttpTransport } from './http';

import {
  NOTIFICATION_COUNTS_QUERY_KEY,
  notificationListKey,
  type NotificationCounts,
  type NotificationsDeps,
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

function connect(options: { readonly now?: () => number; readonly notificationsApi?: NotificationsDeps } = {}) {
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

describe('web-notifs-2 — une réécriture plus ancienne que la première page n’y est pas insérée', () => {
  test('elle appartient à une page non chargée : la cloche ne la pose pas en tête', () => {
    const { socket, queryClient } = connect();
    const row = (id: string, createdAt: string): NotificationRecord => ({
      id,
      type: 'new_message',
      title: null,
      content: id,
      actor: null,
      context: { conversationId: 'conv-1' },
      metadata: {},
      state: { isRead: false, createdAt },
    });
    queryClient.setQueryData(notificationListKey('all'), {
      pages: [{ notifications: [row('n9', '2026-11-17T09:00:00.000Z'), row('n8', '2026-11-17T08:00:00.000Z')], hasMore: true, nextCursor: 'c' }],
      pageParams: [undefined],
    });

    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n1' });
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', '2026-11-17T07:00:00.000Z', 'édité'));

    expect(ids(queryClient)).toEqual(['n9', 'n8']);
  });

  test('une ligne d’une page SUIVANTE, éditée cloche ouverte, reprend son rang dans sa page au lieu de disparaître', () => {
    const { socket, queryClient } = connect();
    const row = (id: string, createdAt: string): NotificationRecord => ({
      id,
      type: 'new_message',
      title: null,
      content: id,
      actor: null,
      context: { conversationId: 'conv-1' },
      metadata: {},
      state: { isRead: false, createdAt },
    });
    queryClient.setQueryData(notificationListKey('all'), {
      pages: [
        { notifications: [row('n9', '2026-11-17T09:00:00.000Z'), row('n8', '2026-11-17T08:00:00.000Z')], hasMore: true, nextCursor: 'c1' },
        { notifications: [row('n6', '2026-11-17T06:00:00.000Z'), row('n5', '2026-11-17T05:00:00.000Z'), row('n4', '2026-11-17T04:00:00.000Z')], hasMore: true, nextCursor: 'c2' },
      ],
      pageParams: [undefined, 'c1'],
    });

    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n5' });
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n5', '2026-11-17T05:00:00.000Z', 'édité'));

    expect(ids(queryClient)).toEqual(['n9', 'n8', 'n6', 'n5', 'n4']);
  });
});

describe('web-notifs-3 — une notification arrivée sur la conversation OUVERTE est lue à l’arrivée', () => {
  const reaction = (id: string, conversationId: string) => ({
    ...served(id, '2026-11-17T09:00:00.000Z', 'Awa a réagi ❤️'),
    type: 'message_reaction',
    context: { conversationId },
  });
  const answering = () => {
    const requests: HttpRequest[] = [];
    const answer: ApiResult<unknown> = { ok: true, data: undefined };
    const transport = { request: async (req: HttpRequest) => (requests.push(req), answer) } as unknown as HttpTransport;
    const notificationsApi: NotificationsDeps = { source: 'gateway', transport };
    return { notificationsApi, calls: () => requests.map((req) => `${req.method} ${req.path}`) };
  };
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const openThread = (pathname: string) => {
    globals.window = { location: { pathname }, addEventListener: () => undefined, removeEventListener: () => undefined };
  };

  test('sur /c/X, la réaction est marquée lue, la pastille ne bouge pas et aucune bannière ne descend', async () => {
    openThread('/c/X');
    const { notificationsApi, calls } = answering();
    const { socket, queryClient } = connect({ notificationsApi });

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, reaction('n1', 'X'));
    await settle();

    expect(calls()).toEqual(['POST /api/v1/notifications/n1/read']);
    expect(unread(queryClient)).toBe(0);
    expect(bannerId()).toBeNull();
  });

  test('sur /c/Y, la même réaction reste non lue et compte', async () => {
    openThread('/c/Y');
    const { notificationsApi, calls } = answering();
    const { socket, queryClient } = connect({ notificationsApi });

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, reaction('n1', 'X'));
    await settle();

    expect(calls()).toEqual([]);
    expect(unread(queryClient)).toBe(1);
    expect(bannerId()).toBe('n1');
  });

  test('cloche jamais ouverte (aucune liste en cache) : la pastille ne passe jamais à +1', async () => {
    openThread('/c/X');
    const { notificationsApi, calls } = answering();
    const { socket, queryClient } = connect({ notificationsApi });
    queryClient.removeQueries({ queryKey: notificationListKey('all') });
    queryClient.removeQueries({ queryKey: notificationListKey('unread') });

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, reaction('n1', 'X'));

    expect(unread(queryClient)).toBe(0);
    await settle();
    expect(calls()).toEqual(['POST /api/v1/notifications/n1/read']);
    expect(unread(queryClient)).toBe(0);
  });

  test('la passerelle refuse le marquage : la notification redevient non lue et compte', async () => {
    openThread('/c/X');
    const requests: HttpRequest[] = [];
    const refused: ApiResult<unknown> = { ok: false, status: 503, error: 'unavailable' };
    const transport = { request: async (req: HttpRequest) => (requests.push(req), refused) } as unknown as HttpTransport;
    const { socket, queryClient } = connect({ notificationsApi: { source: 'gateway', transport } });
    queryClient.removeQueries({ queryKey: notificationListKey('all') });
    queryClient.removeQueries({ queryKey: notificationListKey('unread') });

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, reaction('n1', 'X'));
    await settle();

    expect(requests).toHaveLength(1);
    expect(unread(queryClient)).toBe(1);
  });

  test('onglet caché : rien n’est lu — personne ne regarde le fil', async () => {
    openThread('/c/X');
    globals.document = { hidden: true };
    const { notificationsApi, calls } = answering();
    const { socket, queryClient } = connect({ notificationsApi });

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, reaction('n1', 'X'));
    await settle();

    expect(calls()).toEqual([]);
    expect(unread(queryClient)).toBe(1);
  });

  test('un appel entrant sur le fil ouvert n’est PAS marqué lu : la couche d’appel le présente', async () => {
    openThread('/c/X');
    const { notificationsApi, calls } = answering();
    const { socket } = connect({ notificationsApi });

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, { ...reaction('n1', 'X'), type: 'incoming_call' });
    await settle();

    expect(calls()).toEqual([]);
  });

  test('sans transport de cloche, la notification reste non lue (rien ne part, rien ne casse)', async () => {
    openThread('/c/X');
    const { socket, queryClient } = connect();

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, reaction('n1', 'X'));
    await settle();

    expect(unread(queryClient)).toBe(1);
  });
});
