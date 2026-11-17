import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import { messagesQueryKey } from './messages';
import type { MessagesPage, MessagesPageParam } from './messages-pages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import type { Conversation } from './types';
import { createTypingStore } from './typing-store';

/**
 * **UNE CONVERSATION NEUVE RELIT LA LISTE, JAMAIS LE FIL OUVERT** (#18914,
 * WEB-12) — `conversation:new` invalidait la RACINE `['conversations']`, qui
 * préfixe aussi la fiche et toutes les pages du fil ouvert : une invitation à
 * un groupe reçue en pleine lecture faisait relire le fil entier, page après
 * page. Le témoin d'origine (`socket.test.ts`, « redemande la liste ») garde
 * l'autre moitié.
 */

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  const state = { connected: false };
  return {
    get connected() {
      return state.connected;
    },
    connect: () => {
      state.connected = true;
    },
    disconnect: () => {
      state.connected = false;
    },
    on: (event, handler) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler as SocketHandler));
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

function connected() {
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

const conversationNew = {
  conversationId: 'c-neuve',
  conversationType: 'group',
  title: 'Cousins',
  creatorId: 'u-other',
  participantIds: ['u-other', 'u-viewer'],
  createdAt: '2026-11-17T10:00:00.000Z',
};

const settle = async (queryClient: QueryClient): Promise<void> => {
  for (let i = 0; i < 20 && queryClient.isFetching() > 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('conversation:new — la liste seule (WEB-12)', () => {
  test('le fil OUVERT d’une autre conversation n’est pas relu', async () => {
    const { socket, queryClient, destroy } = connected();
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([]));
    const reads = { count: 0 };
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: messagesQueryKey('c-a'),
      queryFn: (): Promise<MessagesPage> => {
        reads.count += 1;
        return Promise.resolve({ messages: [], hasOlder: false, nextCursor: null });
      },
      initialPageParam: undefined as MessagesPageParam,
      getNextPageParam: () => undefined,
      staleTime: Number.POSITIVE_INFINITY,
    });
    const stop = observer.subscribe(() => undefined);

    socket.fire(SERVER_EVENTS.CONVERSATION_NEW, conversationNew);
    await settle(queryClient);

    expect(reads.count).toBe(0);
    stop();
    destroy();
  });

  test('la fiche d’une conversation en cache n’est pas périmée, la liste l’est', () => {
    const { socket, queryClient, destroy } = connected();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [], pageParams: [] });
    queryClient.setQueryData(conversationQueryKey('c-a'), { id: 'c-a' } as Conversation);

    socket.fire(SERVER_EVENTS.CONVERSATION_NEW, conversationNew);

    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(conversationQueryKey('c-a'))?.isInvalidated).toBe(false);
    destroy();
  });
});
