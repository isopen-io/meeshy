import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { createRealtimeConnection, type RealtimeDeps } from './socket';
import {
  STARRED_LIST_QUERY_KEY,
  STARRED_MEMBERSHIP_QUERY_KEY,
  type StarredListData,
  type StarredMembership,
} from './starred-messages-cache';
import { createTypingStore } from './typing-store';

/**
 * **`message:starred` EST ÉCOUTÉ** (#7378) — un favori posé ou retiré sur un
 * AUTRE appareil (ou un autre onglet) atteint le fil et l'écran des favoris
 * sans rechargement. La LOI vit dans `starred-messages-cache.ts` ; ce témoin
 * garde le BRANCHEMENT : retirer le `socket.on` le fait tomber (même doctrine
 * que `socket-social-realtime.test.ts`).
 *
 * Et une COUPURE du socket a pu en manquer : à la reconnexion, l'ensemble est
 * relu (la charge de l'événement ne se rejoue pas).
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

function connect(): { readonly socket: ReturnType<typeof fakeSocket>; readonly queryClient: QueryClient; readonly destroy: () => void } {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const queryClient = new QueryClient();
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient,
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => 'u-viewer',
    onClearSession: () => undefined,
  };
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient, destroy: connection.destroy };
}

const emptyList: StarredListData = {
  pages: [{ items: [], pagination: { limit: 20, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
};

describe('`message:starred` — le favori d’un autre appareil atteint celui-ci', () => {
  test('une pose ailleurs allume l’étoile ici', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY, {});

    socket.fire(SERVER_EVENTS.MESSAGE_STARRED, {
      messageId: 'm1',
      conversationId: 'c-1',
      starred: true,
      starredAt: '2026-09-22T08:00:00.000Z',
    });

    expect(queryClient.getQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY)).toEqual({ m1: '2026-09-22T08:00:00.000Z' });
    destroy();
  });

  test('un retrait ailleurs l’éteint ici', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY, { m1: '2026-09-22T08:00:00.000Z' });

    socket.fire(SERVER_EVENTS.MESSAGE_STARRED, { messageId: 'm1', conversationId: 'c-1', starred: false, starredAt: null });

    expect(queryClient.getQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY)).toEqual({});
    destroy();
  });

  test('détruite, la connexion n’écoute plus', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY, {});
    destroy();

    socket.fire(SERVER_EVENTS.MESSAGE_STARRED, {
      messageId: 'm1',
      conversationId: 'c-1',
      starred: true,
      starredAt: '2026-09-22T08:00:00.000Z',
    });
    expect(queryClient.getQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY)).toEqual({});
  });

  test('à la RECONNEXION, l’ensemble et la liste sont relus : un écho manqué pendant la coupure ne se rejoue pas', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY, {});
    queryClient.setQueryData<StarredListData>(STARRED_LIST_QUERY_KEY, emptyList);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(queryClient.getQueryState(STARRED_MEMBERSHIP_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(STARRED_LIST_QUERY_KEY)?.isInvalidated).toBe(true);
    destroy();
  });
});
