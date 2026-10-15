import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { localMessage, threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import type { ConversationsPage } from './conversations-pages';
import { messagesQueryKey } from './messages';
import { NOTIFICATION_COUNTS_QUERY_KEY } from './notifications';
import { UNKNOWN_ROW_COALESCE_MS } from './realtime-thread-catch-up';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';
import type { Conversation } from './types';

/**
 * #10573 — « le web rattrape ce qu'il a manqué ». Deux trous du temps réel,
 * témoignés par le BRANCHEMENT (`createRealtimeConnection`) sur un vrai
 * `QueryClient` : une conversation que la liste en cache ne porte pas, et la
 * PREMIÈRE authentification du socket, qui arrive après la première peinture.
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

/** L'ordonnanceur capture `(fn, ms)` sans rien planifier : le témoin fait
 * passer le temps lui-même. */
function fakeScheduler() {
  const scheduled: { readonly fn: () => void; readonly ms: number; cleared: boolean }[] = [];
  return {
    scheduleTimeout: (fn: () => void, ms: number) => {
      const entry = { fn, ms, cleared: false };
      scheduled.push(entry);
      return entry;
    },
    clearTimeoutFn: (handle: unknown) => {
      (handle as { cleared: boolean }).cleared = true;
    },
    pendingListRefetches: () => scheduled.filter((entry) => entry.ms === UNKNOWN_ROW_COALESCE_MS && !entry.cleared),
    elapse: () => {
      for (const entry of scheduled.splice(0)) if (!entry.cleared) entry.fn();
    },
  };
}

function connect() {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const queryClient = new QueryClient();
  const scheduler = fakeScheduler();
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient,
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => 'u-viewer',
    onClearSession: () => undefined,
    scheduleTimeout: scheduler.scheduleTimeout,
    clearTimeoutFn: scheduler.clearTimeoutFn,
  };
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient, scheduler, destroy: connection.destroy };
}

const row = (id: string): Conversation =>
  ({
    id,
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    unreadCount: 0,
  }) as Conversation;

const listOf = (ids: readonly string[]): { readonly pages: readonly ConversationsPage[]; readonly pageParams: readonly unknown[] } => ({
  pages: [
    {
      conversations: ids.map(row),
      pagination: { limit: 30, offset: 0, total: ids.length, hasMore: false },
      cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
    },
  ],
  pageParams: [undefined],
});

const messageNew = (conversationId: string, id: string) => ({
  id,
  conversationId,
  senderId: 'u-other',
  content: 'salut',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-10-13T08:00:00.000Z',
});

const conversationUpdated = (conversationId: string) => ({
  conversationId,
  updatedBy: { id: 'u-other' },
  updatedAt: '2026-10-13T08:00:00.000Z',
  lastMessageAt: '2026-10-13T08:00:00.000Z',
  lastMessageId: 'm-9',
  lastMessagePreview: 'salut',
});

const isInvalidated = (queryClient: QueryClient, queryKey: readonly unknown[]): boolean =>
  queryClient.getQueryState(queryKey)?.isInvalidated === true;

const EVENTS_NAMING_A_CONVERSATION = [
  [SERVER_EVENTS.MESSAGE_NEW, (id: string) => messageNew(id, 'm-1')],
  [SERVER_EVENTS.CONVERSATION_UPDATED, conversationUpdated],
  [SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, (id: string) => ({ conversationId: id, unreadCount: 3 })],
] as const;

describe('#10573 — une conversation absente de la liste en cache fait relire la liste', () => {
  for (const [event, payloadFor] of EVENTS_NAMING_A_CONVERSATION) {
    test(`\`${event}\` sur une conversation hors page relit la LISTE, et elle seule`, () => {
      const { socket, queryClient, scheduler } = connect();
      queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));
      queryClient.setQueryData(conversationQueryKey('c-a'), row('c-a'));
      queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([localMessage({ id: 'm-0' })]));

      socket.fire(event, payloadFor('c-hors-page'));
      expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(false);
      scheduler.elapse();

      expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(true);
      expect(isInvalidated(queryClient, conversationQueryKey('c-a'))).toBe(false);
      expect(isInvalidated(queryClient, messagesQueryKey('c-a'))).toBe(false);
    });
  }

  test('une rafale sur des conversations inconnues ne relit la liste qu’UNE fois', () => {
    const { socket, queryClient, scheduler } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));

    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-1'));
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-2'));
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, conversationUpdated('c-y'));
    socket.fire(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, { conversationId: 'c-z', unreadCount: 1 });

    expect(scheduler.pendingListRefetches()).toHaveLength(1);
  });

  test('la rafale suivante relit de nouveau', () => {
    const { socket, queryClient, scheduler } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-1'));
    scheduler.elapse();

    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-2'));

    expect(scheduler.pendingListRefetches()).toHaveLength(1);
  });

  test('une conversation que la liste porte déjà ne relit rien', () => {
    const { socket, queryClient, scheduler } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));

    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-a', 'm-1'));
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, conversationUpdated('c-a'));
    socket.fire(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, { conversationId: 'c-a', unreadCount: 1 });

    expect(scheduler.pendingListRefetches()).toHaveLength(0);
  });

  test('une liste jamais chargée n’est pas demandée : la prochaine ouverture la charge', () => {
    const { socket, queryClient, scheduler } = connect();

    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-1'));

    expect(scheduler.pendingListRefetches()).toHaveLength(0);
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)).toBeUndefined();
  });

  test('`destroy` annule la relecture en attente', () => {
    const { socket, queryClient, scheduler, destroy } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-1'));

    destroy();
    scheduler.elapse();

    expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(false);
  });
});

type Server = { calls: number; respond: () => Promise<unknown> };

const counted = (server: Server) => () => {
  server.calls += 1;
  return server.respond();
};

/** L'écran OUVERT : un observateur abonné, donc une requête ACTIVE. */
function observe(queryClient: QueryClient, queryKey: readonly unknown[], server: Server, staleTime: number): () => void {
  const observer = new QueryObserver(queryClient, { queryKey, queryFn: counted(server), staleTime });
  return observer.subscribe(() => undefined);
}

const settle = async (queryClient: QueryClient): Promise<void> => {
  for (let i = 0; i < 20 && queryClient.isFetching() > 0; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const never = (): Promise<unknown> => new Promise(() => undefined);

describe('#10573 — la PREMIÈRE authentification rattrape ce que la liste et le fil servis ont manqué', () => {
  test('la liste et le fil déjà servis et ouverts sont relus', async () => {
    const { socket, queryClient } = connect();
    const list: Server = { calls: 0, respond: () => Promise.resolve(listOf(['c-a'])) };
    const thread: Server = { calls: 0, respond: () => Promise.resolve(threadPages([])) };
    const stopList = observe(queryClient, CONVERSATIONS_QUERY_KEY, list, Number.POSITIVE_INFINITY);
    const stopThread = observe(queryClient, messagesQueryKey('c-a'), thread, Number.POSITIVE_INFINITY);
    await settle(queryClient);
    expect([list.calls, thread.calls]).toEqual([1, 1]);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    await settle(queryClient);

    expect([list.calls, thread.calls]).toEqual([2, 2]);
    stopList();
    stopThread();
  });

  test('une requête jamais servie, encore en vol au démarrage, n’est pas redemandée', async () => {
    const { socket, queryClient } = connect();
    const list: Server = { calls: 0, respond: never };
    const stop = observe(queryClient, CONVERSATIONS_QUERY_KEY, list, Number.POSITIVE_INFINITY);
    expect(list.calls).toBe(1);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(list.calls).toBe(1);
    expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(false);
    stop();
  });

  test('une liste restaurée dont la relecture est déjà en vol n’est pas doublée', async () => {
    const { socket, queryClient } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));
    const list: Server = { calls: 0, respond: never };
    const stop = observe(queryClient, CONVERSATIONS_QUERY_KEY, list, 0);
    expect(list.calls).toBe(1);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(list.calls).toBe(1);
    stop();
  });

  test('la case d’une conversation, une fenêtre ancrée et la cloche ne sont pas touchées', () => {
    const { socket, queryClient } = connect();
    const anchored = [...messagesQueryKey('c-a'), 'around', 'm-0'] as const;
    queryClient.setQueryData(conversationQueryKey('c-a'), row('c-a'));
    queryClient.setQueryData(anchored, threadPages([]));
    queryClient.setQueryData(NOTIFICATION_COUNTS_QUERY_KEY, { total: 0, unread: 0, byType: {} });

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(isInvalidated(queryClient, conversationQueryKey('c-a'))).toBe(false);
    expect(isInvalidated(queryClient, anchored)).toBe(false);
    expect(isInvalidated(queryClient, NOTIFICATION_COUNTS_QUERY_KEY)).toBe(false);
  });
});
