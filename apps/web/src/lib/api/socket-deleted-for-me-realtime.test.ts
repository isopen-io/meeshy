import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, conversationsInfiniteOptions } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { createHttpTransport } from './http';
import { messagesQueryKey } from './messages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import type { Conversation } from './types';
import { createTypingStore } from './typing-store';

/**
 * **SUPPRIMÉE OU RESTAURÉE POUR MOI AILLEURS, ET UN MESSAGE RESTAURÉ POUR MOI**
 * (#18914, WEB-07) — `conversation:deleted`, `conversation:restored` et
 * `message:restored-for-me` voyagent vers la salle personnelle du lecteur ; le
 * web n'en écoutait aucun. Une conversation supprimée pour moi sur iOS restait
 * dans la liste web, une restaurée n'y revenait qu'à une relecture COMPLÈTE, et
 * un message restauré pour moi ne revenait qu'au rechargement du fil.
 */

const VIEWER = 'u-viewer';

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

function connected(queryClient: QueryClient = new QueryClient()) {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const gone: string[] = [];
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient,
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => VIEWER,
    onClearSession: () => undefined,
    onConversationGone: (id) => gone.push(id),
  };
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient, gone, destroy: connection.destroy };
}

const SERVED_AT = '2026-11-17T08:00:00.000Z';

const row = (id: string): Conversation =>
  ({ id, type: 'group', status: 'active', visibility: 'private', isActive: true, memberCount: 3, participants: [], createdAt: SERVED_AT, updatedAt: SERVED_AT }) as unknown as Conversation;

const seedList = (queryClient: QueryClient, ids: readonly string[]): void => {
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: ids.map(row),
        pagination: { limit: 30, offset: 0, total: ids.length, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
};

const listed = (queryClient: QueryClient): readonly string[] =>
  queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)?.pages.flatMap((page) => page.conversations.map((c) => c.id)) ?? [];

const isInvalidated = (queryClient: QueryClient, queryKey: readonly unknown[]): boolean =>
  queryClient.getQueryState(queryKey)?.isInvalidated === true;

const settle = async (queryClient: QueryClient): Promise<void> => {
  for (let i = 0; i < 40 && queryClient.isFetching() > 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** Une passerelle qui sert la liste ou son delta, et garde ce qui est parti. */
function listGateway(ids: readonly string[]) {
  const calls: { readonly updatedSince: string | null }[] = [];
  const page = { success: true, data: ids.map(row), pagination: { limit: 30, offset: 0, total: ids.length, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } };
  const delta = { ...page, meta: { deletedConversationIds: [], deletedConversationIdsTruncated: false } };
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const updatedSince = new URL(String(input), 'http://x').searchParams.get('updatedSince');
    calls.push({ updatedSince });
    return new Response(JSON.stringify(updatedSince === null ? page : delta), { status: 200 });
  }) as typeof fetch;
  return { calls, deps: { source: 'gateway' as const, transport: createHttpTransport({ base: '', fetchImpl }), now: () => Date.parse(SERVED_AT) } };
}

describe('conversation:deleted — supprimée pour moi sur un autre appareil (WEB-07)', () => {
  test('la ligne, la fiche et le fil partent, et le fil ouvert se referme', () => {
    const { socket, queryClient, gone, destroy } = connected();
    seedList(queryClient, ['c-a', 'c-b']);
    queryClient.setQueryData(conversationQueryKey('c-a'), row('c-a'));
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([]));

    socket.fire(SERVER_EVENTS.CONVERSATION_DELETED, { userId: VIEWER, conversationId: 'c-a' });

    expect(listed(queryClient)).toEqual(['c-b']);
    expect(queryClient.getQueryData(conversationQueryKey('c-a'))).toBeUndefined();
    expect(queryClient.getQueryData(messagesQueryKey('c-a'))).toBeUndefined();
    expect(gone).toEqual(['c-a']);
    destroy();
  });

  test('une charge qui nomme un AUTRE compte ne retire rien (fail-closed)', () => {
    const { socket, queryClient, gone, destroy } = connected();
    seedList(queryClient, ['c-a', 'c-b']);

    socket.fire(SERVER_EVENTS.CONVERSATION_DELETED, { userId: 'u-autre', conversationId: 'c-a' });
    socket.fire(SERVER_EVENTS.CONVERSATION_DELETED, { conversationId: 'c-a' });

    expect(listed(queryClient)).toEqual(['c-a', 'c-b']);
    expect(gone).toEqual([]);
    destroy();
  });
});

describe('conversation:restored — restaurée pour moi sur un autre appareil (WEB-07)', () => {
  const loadedList = async () => {
    const gateway = listGateway(['c-a']);
    const queryClient = new QueryClient();
    const options = conversationsInfiniteOptions(gateway.deps);
    await queryClient.fetchInfiniteQuery({ ...options, pages: 1 });
    const observer = new InfiniteQueryObserver(queryClient, { ...options, staleTime: Number.POSITIVE_INFINITY });
    const stop = observer.subscribe(() => undefined);
    gateway.calls.length = 0;
    return { ...gateway, queryClient, stop };
  };

  test('la liste se relit EN ENTIER : une restauration ne bouge pas `updatedAt`, le delta ne la ramènerait pas', async () => {
    const { calls, queryClient, stop } = await loadedList();
    const { socket, destroy } = connected(queryClient);

    socket.fire(SERVER_EVENTS.CONVERSATION_RESTORED, { userId: VIEWER, conversationId: 'c-revenue' });
    await settle(queryClient);

    expect(calls).toEqual([{ updatedSince: null }]);
    destroy();
    stop();
  });

  test('une charge qui nomme un AUTRE compte ne relit rien', async () => {
    const { calls, queryClient, stop } = await loadedList();
    const { socket, destroy } = connected(queryClient);

    socket.fire(SERVER_EVENTS.CONVERSATION_RESTORED, { userId: 'u-autre', conversationId: 'c-revenue' });
    await settle(queryClient);

    expect(calls).toEqual([]);
    destroy();
    stop();
  });
});

describe('message:restored-for-me — un message restauré pour moi revient dans son fil (WEB-07)', () => {
  test('le fil de chaque conversation nommée se relit, lui seul', () => {
    const { socket, queryClient, destroy } = connected();
    seedList(queryClient, ['c-a', 'c-b', 'c-c']);
    const anchored = [...messagesQueryKey('c-a'), 'around', 'm-1'] as const;
    for (const id of ['c-a', 'c-b', 'c-c']) queryClient.setQueryData(messagesQueryKey(id), threadPages([]));
    queryClient.setQueryData(anchored, threadPages([]));
    queryClient.setQueryData(conversationQueryKey('c-a'), row('c-a'));

    socket.fire(SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME, {
      userId: VIEWER,
      messages: [
        { messageId: 'm-1', conversationId: 'c-a' },
        { messageId: 'm-2', conversationId: 'c-a' },
        { messageId: 'm-9', conversationId: 'c-b' },
      ],
      restoredAt: '2026-11-17T10:00:00.000Z',
    });

    expect(isInvalidated(queryClient, messagesQueryKey('c-a'))).toBe(true);
    expect(isInvalidated(queryClient, messagesQueryKey('c-b'))).toBe(true);
    expect(isInvalidated(queryClient, messagesQueryKey('c-c'))).toBe(false);
    expect(isInvalidated(queryClient, anchored)).toBe(false);
    expect(isInvalidated(queryClient, conversationQueryKey('c-a'))).toBe(false);
    expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(false);
    destroy();
  });

  test('une charge qui nomme un AUTRE compte ne relit rien', () => {
    const { socket, queryClient, destroy } = connected();
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([]));

    socket.fire(SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME, {
      userId: 'u-autre',
      messages: [{ messageId: 'm-1', conversationId: 'c-a' }],
      restoredAt: '2026-11-17T10:00:00.000Z',
    });

    expect(isInvalidated(queryClient, messagesQueryKey('c-a'))).toBe(false);
    destroy();
  });
});
