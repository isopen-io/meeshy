import { QueryClient, type InvalidateQueryFilters } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';
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
 * **LE WEB OBSERVE LE CURSEUR `_seq` ET SE RESYNCHRONISE SUR UN TROU** (#18601).
 *
 * La passerelle estampille les émissions user-scoped d'un curseur monotone par
 * compte ; iOS et Android l'observent depuis le cycle 163, le web ne l'observait
 * PAS — il était la seule plateforme sans détection de trou exacte.
 *
 * Chaque témoin passe par la VRAIE connexion (`createRealtimeConnection`) sur un
 * faux socket, et lit l'EFFET : le compte de la cloche se périme-t-il ? C'est le
 * seul signal qui distingue un trou d'une arrivée ordinaire — `applyNotificationNew`
 * périme les LISTES à chaque notification, jamais le compte.
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

/** La charge d'une notification servie, telle que la passerelle l'émet, plus son curseur. */
const served = (id: string, seq?: number) => ({
  id,
  userId: 'u-viewer',
  type: 'new_message',
  priority: 'normal',
  title: 'Awa',
  content: 'Écoute ce vocal',
  actor: { id: 'u-awa', username: 'awa', displayName: 'Awa' },
  context: { conversationId: 'conv-1' },
  metadata: {},
  state: { isRead: false, readAt: null, createdAt: '2026-11-22T08:00:00.000Z' },
  ...(seq === undefined ? {} : { _seq: seq }),
});

function connect() {
  const socket = fakeSocket();
  const queryClient = new QueryClient();
  const empty: NotificationsInfiniteData = { pages: [{ notifications: [], hasMore: false, nextCursor: null }], pageParams: [undefined] };
  queryClient.setQueryData(notificationListKey('all'), empty);
  queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 0, unread: 0, byType: {} });

  /* Le relevé des péremptions DEMANDÉES — `isInvalidated` ne saurait pas les
     compter, et c'est leur NOMBRE qui distingue « un trou signalé une fois »
     de « un trou signalé à chaque événement suivant ». */
  const invalidated: string[] = [];
  const original = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = ((filters?: InvalidateQueryFilters) => {
    invalidated.push(JSON.stringify(filters?.queryKey ?? []));
    return original(filters);
  }) as typeof queryClient.invalidateQueries;

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

  const countsInvalidations = (): number =>
    invalidated.filter((key) => key === JSON.stringify(NOTIFICATION_COUNTS_QUERY_KEY)).length;

  return { socket, queryClient, countsInvalidations };
}

const ids = (queryClient: QueryClient): readonly string[] =>
  queryClient.getQueryData<NotificationsInfiniteData>(notificationListKey('all'))?.pages.flatMap((p) => p.notifications.map((n) => n.id)) ?? [];

describe('#18601 — le web observe le curseur `_seq` et se resynchronise sur un trou', () => {
  test('des curseurs CONTIGUS ne déclenchent aucune resynchronisation', () => {
    const { socket, countsInvalidations } = connect();

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', 5));
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n2', 6));

    expect(countsInvalidations()).toBe(0);
  });

  test('un SAUT au-delà de `lastSeq + 1` périme le compte de la cloche', () => {
    const { socket, countsInvalidations } = connect();

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', 5));
    expect(countsInvalidations()).toBe(0);

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n2', 9));

    expect(countsInvalidations()).toBe(1);
  });

  test('le PREMIER événement n’est jamais un trou, si haut que soit son curseur', () => {
    const { socket, countsInvalidations } = connect();

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', 91_230));

    expect(countsInvalidations()).toBe(0);
  });

  test('un doublon ou un réordonnancement n’est pas un trou, et ne fait pas reculer le curseur', () => {
    const { socket, countsInvalidations } = connect();

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', 5));
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n2', 4));
    expect(countsInvalidations()).toBe(0);

    /* Si le curseur avait reculé à 4, ce 6 serait un trou — il ne l'est pas. */
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n3', 6));

    expect(countsInvalidations()).toBe(0);
  });

  test('un trou se signale UNE fois : la suite contiguë ne resynchronise plus', () => {
    const { socket, countsInvalidations } = connect();

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', 5));
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n2', 9));
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n3', 10));

    expect(countsInvalidations()).toBe(1);
  });

  test('une passerelle ANTÉRIEURE (aucun `_seq`) ne fabrique aucun trou, et la notification arrive quand même', () => {
    const { socket, queryClient, countsInvalidations } = connect();

    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1'));
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n2'));

    expect(countsInvalidations()).toBe(0);
    expect(ids(queryClient)).toEqual(['n2', 'n1']);
  });

  /**
   * LA RÈGLE QUE LES DEUX MIROIRS PORTENT DÉJÀ : le curseur suit le flux
   * SERVEUR, pas le succès du consommateur. Une charge malformée estampillée 5
   * n'est pas appliquée — et doit tout de même avancer le curseur, sans quoi le
   * 6 qui suit passerait pour un trou. Un bogue d'affichage coûterait alors une
   * resynchronisation à chaque événement.
   */
  test('une charge MALFORMÉE avance quand même le curseur — le trou suivant est faux, et ne doit pas se produire', () => {
    const { socket, queryClient, countsInvalidations } = connect();

    /* Le curseur doit être DÉJÀ parti, sinon le témoin ne peut pas tomber : un
       curseur resté à `null` ferait du 6 un PREMIER événement, donc jamais un
       trou, et la mutation « n'observer que ce que le consommateur sait lire »
       passerait au vert (mesuré). */
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1', 4));
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, { _seq: 5, pas: 'une notification' });
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n2', 6));

    expect(countsInvalidations()).toBe(0);
    expect(ids(queryClient)).toEqual(['n2', 'n1']);
  });
});
