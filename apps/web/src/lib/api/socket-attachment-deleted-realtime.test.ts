import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * LE BRANCHEMENT de `attachment:deleted` (#13611) : `socket.ts` l'écoute, et cesse à `destroy`.
 * Les règles vivent dans `realtime-attachment-deleted.ts`.
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
    threadPages([localMessage({ id: 'm-1', content: '', senderId: 'u-other', attachments: [{ id: 'a-1', messageId: 'm-1', mimeType: 'image/png', fileUrl: 'https://cdn.example/a.png' } as never] })]),
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
const deleted = { conversationId: 'c-a', messageId: 'm-1', attachmentId: 'a-1' };

describe('`attachment:deleted` est écouté (#13611)', () => {
  test('la pièce retirée par un membre quitte le fil ; sans texte, la bulle devient une pierre tombale', () => {
    const { socket, queryClient } = connected();
    socket.fire(SERVER_EVENTS.ATTACHMENT_DELETED, deleted);
    expect(rowOf(queryClient)?.deletedAt).toBeDefined();
    expect(rowOf(queryClient)?.attachments).toBeUndefined();
  });

  test('une charge incomplète est ignorée', () => {
    const { socket, queryClient } = connected();
    socket.fire(SERVER_EVENTS.ATTACHMENT_DELETED, { conversationId: 'c-a', messageId: 'm-1' });
    expect(rowOf(queryClient)?.attachments?.length).toBe(1);
  });

  test('`destroy` démonte l’écouteur', () => {
    const { socket, queryClient, destroy } = connected();
    destroy();
    socket.fire(SERVER_EVENTS.ATTACHMENT_DELETED, deleted);
    expect(rowOf(queryClient)?.attachments?.length).toBe(1);
  });
});
