import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { localMessage, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * #9291 — LE BRANCHEMENT du rattrapage : `conversation:updated` et
 * `notification:new` voyagent dans la room PERSONNELLE, que le socket ne
 * quitte jamais ; quand l'un d'eux nomme un message absent du fil ouvert, le
 * fil est relu. La loi vit dans `realtime-thread-catch-up.ts` ; ce témoin
 * tombe si un `socket.on` cesse de l'appeler.
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

function connect() {
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
  queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([localMessage({ id: 'm-0', senderId: 'u-other' })]));
  return { socket, queryClient, destroy: connection.destroy };
}

const isStale = (queryClient: QueryClient): boolean =>
  queryClient.getQueryState(messagesQueryKey('c-a'))?.isInvalidated === true;

const updated = (overrides: Readonly<Record<string, unknown>>) => ({
  conversationId: 'c-a',
  updatedBy: { id: 'u-other' },
  updatedAt: '2026-10-04T06:01:00.000Z',
  lastMessageAt: '2026-10-04T06:01:00.000Z',
  lastMessageId: 'm-1',
  ...overrides,
});

const notification = (overrides: Readonly<Record<string, unknown>>) => ({
  id: 'n-1',
  type: 'new_message',
  content: 'arrivé',
  context: { conversationId: 'c-a', messageId: 'm-1' },
  state: { isRead: false, createdAt: '2026-10-04T06:01:00.000Z' },
  ...overrides,
});

describe('#9291 — conversation:updated rattrape un message:new perdu', () => {
  test('un dernier message ABSENT du fil ouvert relit le fil', () => {
    const { socket, queryClient, destroy } = connect();
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, updated({}));
    expect(isStale(queryClient)).toBe(true);
    destroy();
  });

  test('un dernier message DÉJÀ dans le fil ne relit rien', () => {
    const { socket, queryClient, destroy } = connect();
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, updated({ lastMessageId: 'm-0' }));
    expect(isStale(queryClient)).toBe(false);
    destroy();
  });

  test('MON propre envoi ne relit rien — son écho voyage par ma room personnelle, et l’outbox le tient', () => {
    const { socket, queryClient, destroy } = connect();
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, updated({ updatedBy: { id: 'u-viewer' } }));
    expect(isStale(queryClient)).toBe(false);
    destroy();
  });

  test('une mise à jour sans dernier message (renommage, réglage) ne relit rien', () => {
    const { socket, queryClient, destroy } = connect();
    const { lastMessageId: _drop, ...renamed } = updated({ title: 'Nouveau nom' });
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, renamed);
    expect(isStale(queryClient)).toBe(false);
    destroy();
  });
});

describe('#9291 — notification:new d’un message rattrape le fil', () => {
  test('la notification d’un message absent du fil ouvert relit le fil', () => {
    const { socket, queryClient, destroy } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, notification({}));
    expect(isStale(queryClient)).toBe(true);
    destroy();
  });

  test('une réponse et une mention aussi', () => {
    for (const type of ['message_reply', 'user_mentioned', 'mention']) {
      const { socket, queryClient, destroy } = connect();
      socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, notification({ id: `n-${type}`, type }));
      expect(isStale(queryClient)).toBe(true);
      destroy();
    }
  });

  test('une réaction sur un message ancien ne relit pas le fil', () => {
    const { socket, queryClient, destroy } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, notification({ type: 'message_reaction', context: { conversationId: 'c-a', messageId: 'm-ancien' } }));
    expect(isStale(queryClient)).toBe(false);
    destroy();
  });
});
