import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import type { Conversation } from './types';
import { createTypingStore } from './typing-store';

/**
 * **LE RANG DU LECTEUR CHANGE, SA CAPACITÉ SUIT, LISTE OUVERTE** (#15987) — hors
 * de la feuille des membres, rien n'écoutait `participant:role-updated`. Le
 * témoin garde le BRANCHEMENT : retirer le `socket.on` le fait tomber.
 */

const VIEWER = 'u-viewer';

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
    viewerId: () => VIEWER,
    onClearSession: () => undefined,
  };
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient, destroy: connection.destroy };
}

const seed = (queryClient: QueryClient) => {
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [{ id: 'a', type: 'group', participants: [], currentUserRole: 'member', viewerCapabilities: { canMakeObsolete: false } } as unknown as Conversation],
        pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
};

const row = (queryClient: QueryClient) => queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)?.pages[0]?.conversations[0];

describe('#15987 — promu, le lecteur voit sa capacité dans la liste', () => {
  test('participant:role-updated qui le nomme pose la capacité servie et le rang', () => {
    const { socket, queryClient, destroy } = connect();
    seed(queryClient);
    socket.fire(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, {
      conversationId: 'a', userId: VIEWER, newRole: 'admin', updatedBy: 'u-z', viewerCapabilities: { canMakeObsolete: true },
    });
    expect(row(queryClient)?.viewerCapabilities).toEqual({ canMakeObsolete: true });
    expect(row(queryClient)?.currentUserRole).toBe('admin');
    destroy();
  });

  test('détruite, la connexion n’écoute plus', () => {
    const { socket, queryClient, destroy } = connect();
    seed(queryClient);
    destroy();
    socket.fire(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, {
      conversationId: 'a', userId: VIEWER, newRole: 'admin', updatedBy: 'u-z', viewerCapabilities: { canMakeObsolete: true },
    });
    expect(row(queryClient)?.viewerCapabilities).toEqual({ canMakeObsolete: false });
  });
});
