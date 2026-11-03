import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { messagesQueryKey } from './messages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import type { Conversation } from './types';
import { createTypingStore } from './typing-store';

/**
 * **UNE CONVERSATION FERMÉE OU RENDUE OBSOLÈTE QUITTE L'ÉCRAN EN DIRECT** (#14645)
 * — le web n'écoutait ni `conversation:closed` ni `conversation:obsoleted`.
 * Le témoin garde le BRANCHEMENT : retirer un `socket.on` le fait tomber.
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

function connect(gone: string[] = []): { readonly socket: ReturnType<typeof fakeSocket>; readonly queryClient: QueryClient; readonly destroy: () => void } {
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
    onConversationGone: (id) => gone.push(id),
  };
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient, destroy: connection.destroy };
}

const seed = (queryClient: QueryClient) => {
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: ['a', 'b'].map((id) => ({ id, type: 'group', participants: [] }) as unknown as Conversation),
        pagination: { limit: 30, offset: 0, total: 2, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
  queryClient.setQueryData(conversationQueryKey('b'), { id: 'b' });
  queryClient.setQueryData(messagesQueryKey('b'), { pages: [] });
};

const listed = (queryClient: QueryClient) =>
  queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)?.pages.flatMap((p) => p.conversations.map((c) => c.id));

describe('#14645 — fermée ou obsolète, la conversation part', () => {
  for (const event of [SERVER_EVENTS.CONVERSATION_CLOSED, SERVER_EVENTS.CONVERSATION_OBSOLETED]) {
    test(`${event} retire la ligne, le détail et les messages, et ferme le fil`, () => {
      const gone: string[] = [];
      const { socket, queryClient, destroy } = connect(gone);
      seed(queryClient);

      socket.fire(event, { conversationId: 'b', closedBy: 'u-admin', closedAt: '2026-11-02T10:00:00.000Z' });

      expect(listed(queryClient)).toEqual(['a']);
      expect(queryClient.getQueryData(conversationQueryKey('b'))).toBeUndefined();
      expect(queryClient.getQueryData(messagesQueryKey('b'))).toBeUndefined();
      expect(gone).toEqual(['b']);
      destroy();
    });
  }

  test('une charge illisible ne retire rien', () => {
    const gone: string[] = [];
    const { socket, queryClient, destroy } = connect(gone);
    seed(queryClient);
    socket.fire(SERVER_EVENTS.CONVERSATION_OBSOLETED, { obsoletedBy: 'u-admin' });
    expect(listed(queryClient)).toEqual(['a', 'b']);
    expect(gone).toEqual([]);
    destroy();
  });
});
