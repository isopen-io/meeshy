import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { mineOf, reactionStore } from './reaction-store';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * LE BRANCHEMENT (#5863, #7926) — `reaction:added|removed`,
 * `message:edited` et `message:deleted` atteignent le cache du fil. Les règles
 * vivent dans `realtime-message-reactions.ts` et
 * `realtime-message-mutations.ts` ; ces témoins prouvent que `socket.ts` les
 * ÉCOUTE, et qu'il cesse de les écouter à `destroy`. L'épreuve de chacun est
 * sa MUTATION : retirer un `socket.on` le fait tomber.
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

function connected(): { readonly socket: ReturnType<typeof fakeSocket>; readonly queryClient: QueryClient; readonly destroy: () => void } {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    messagesQueryKey('c-a'),
    threadPages([localMessage({ id: 'm-1', content: 'avant', senderId: 'u-other' })]),
  );
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

const rowOf = (queryClient: QueryClient) => threadOf(queryClient, 'c-a')?.messages[0];

const reaction = (action: 'add' | 'remove', count: number, userId = 'u-viewer') => ({
  messageId: 'm-1',
  conversationId: 'c-a',
  participantId: 'p-1',
  userId,
  emoji: '🔥',
  action,
  aggregation: { emoji: '🔥', count, participantIds: [] },
  timestamp: '2026-09-25T10:00:00.000Z',
});

const edit = {
  id: 'm-1',
  conversationId: 'c-a',
  senderId: 'u-other',
  content: 'après',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-12T09:00:00.000Z',
  isEdited: true,
  editedAt: '2026-09-25T10:00:00.000Z',
  translations: [],
};

beforeEach(() => {
  reactionStore.setState({ mine: {} });
});

describe('les réactions d’un MESSAGE sont écoutées (#5863)', () => {
  test('ajout puis retrait : le compte et « ma réaction » suivent', () => {
    const { socket, queryClient } = connected();

    socket.fire(SERVER_EVENTS.REACTION_ADDED, reaction('add', 1));
    expect(rowOf(queryClient)?.reactionSummary).toEqual({ '🔥': 1 });
    expect(mineOf('m-1')).toEqual(['🔥']);

    socket.fire(SERVER_EVENTS.REACTION_REMOVED, reaction('remove', 0));
    expect(rowOf(queryClient)?.reactionSummary).toEqual({});
    expect(mineOf('m-1')).toEqual([]);
  });

  test('`destroy` démonte les deux écouteurs', () => {
    const { socket, queryClient, destroy } = connected();
    destroy();

    socket.fire(SERVER_EVENTS.REACTION_ADDED, reaction('add', 1));
    socket.fire(SERVER_EVENTS.REACTION_REMOVED, reaction('remove', 0));
    expect(rowOf(queryClient)?.reactionSummary).toBeUndefined();
  });
});

describe('l’édition et la suppression d’un message sont écoutées (#7926)', () => {
  test('`message:edited` pose le texte modifié', () => {
    const { socket, queryClient } = connected();

    socket.fire(SERVER_EVENTS.MESSAGE_EDITED, edit);

    expect(rowOf(queryClient)?.content).toBe('après');
    expect(rowOf(queryClient)?.isEdited).toBe(true);
  });

  test('`message:deleted` rend la pierre tombale', () => {
    const { socket, queryClient } = connected();

    socket.fire(SERVER_EVENTS.MESSAGE_DELETED, { messageId: 'm-1', conversationId: 'c-a' });

    expect(rowOf(queryClient)?.deletedAt).toBeDefined();
    expect(rowOf(queryClient)?.content).toBe('');
  });

  test('`destroy` démonte les deux écouteurs', () => {
    const { socket, queryClient, destroy } = connected();
    destroy();

    socket.fire(SERVER_EVENTS.MESSAGE_EDITED, edit);
    socket.fire(SERVER_EVENTS.MESSAGE_DELETED, { messageId: 'm-1', conversationId: 'c-a' });

    expect(rowOf(queryClient)?.content).toBe('avant');
    expect(rowOf(queryClient)?.deletedAt).toBeUndefined();
  });
});
