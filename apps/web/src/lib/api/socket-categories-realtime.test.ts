import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { CONVERSATION_CATEGORIES_QUERY_KEY } from './conversations';
import { createTypingStore } from './typing-store';

/**
 * **LES CATÉGORIES SUIVENT LA PASSERELLE** (#10103) — `category:*` et
 * `categories:reordered` partent vers la salle du compte
 * (`broadcastToUser`, `routes/me/preferences/categories.ts`) : une catégorie
 * créée, renommée, repliée, supprimée ou réordonnée sur un autre appareil
 * repeint les sections de la liste. Une invalidation, jamais une reconstruction
 * depuis la charge ; ce témoin garde le BRANCHEMENT, puis son retrait.
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
  return { socket, queryClient, destroy: connection.destroy };
}

const CATEGORY_EVENTS: readonly [string, unknown][] = [
  [SERVER_EVENTS.CATEGORY_CREATED, { userId: 'u-viewer', category: { id: 'cat-1' } }],
  [SERVER_EVENTS.CATEGORY_UPDATED, { userId: 'u-viewer', category: { id: 'cat-1', isExpanded: false } }],
  [SERVER_EVENTS.CATEGORY_DELETED, { userId: 'u-viewer', categoryId: 'cat-1' }],
  [SERVER_EVENTS.CATEGORIES_REORDERED, { userId: 'u-viewer', updates: [] }],
];

describe('`category:*` — les sections de catégorie suivent les autres appareils', () => {
  for (const [event, payload] of CATEGORY_EVENTS) {
    test(`\`${event}\` invalide les catégories du lecteur`, () => {
      const { socket, queryClient, destroy } = connect();
      queryClient.setQueryData(CONVERSATION_CATEGORIES_QUERY_KEY, []);
      socket.fire(event, payload);
      expect(queryClient.getQueryState(CONVERSATION_CATEGORIES_QUERY_KEY)?.isInvalidated).toBe(true);
      destroy();
    });
  }

  test('après `destroy`, plus aucun écouteur', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(CONVERSATION_CATEGORIES_QUERY_KEY, []);
    destroy();
    socket.fire(SERVER_EVENTS.CATEGORY_UPDATED, { userId: 'u-viewer', category: { id: 'cat-1' } });
    expect(queryClient.getQueryState(CONVERSATION_CATEGORIES_QUERY_KEY)?.isInvalidated).toBe(false);
  });
});
