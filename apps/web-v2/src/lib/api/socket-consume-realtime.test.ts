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
 * `message:consumed` EST ÉCOUTÉ (#7354, V6) — LA MOITIÉ SOCKET DE
 * `consumeViewOnceOptimistic` (`view-once.ts:20-26`, qui annonçait déjà cet
 * événement PAIR sans qu'aucun `socket.on` ne le branche : mesuré avant ce
 * lot, `grep MESSAGE_CONSUMED src/lib/api/socket.ts` rendait vide).
 *
 * Motif `socket-social-realtime.test.ts` (extraction PAR RESPONSABILITÉ,
 * `socket.test.ts` porte déjà 1235 lignes pour un budget de 1200 — CLAUDE.md
 * racine, § Code Style — y ajouter était interdit AVANT ce lot).
 *
 * **L'ÉPREUVE N'EST PAS SON VERT mais sa MUTATION** — retirer le
 * `socket.on(SERVER_EVENTS.MESSAGE_CONSUMED, …)` de `socket.ts` doit le
 * faire TOMBER.
 */
function fakeSocket(): SocketClient & {
  fire(event: string, payload: unknown): void;
} {
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

function buildDeps(overrides: Partial<RealtimeDeps> = {}): {
  readonly deps: RealtimeDeps;
  readonly socket: ReturnType<typeof fakeSocket>;
  readonly queryClient: QueryClient;
} {
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
    ...overrides,
  };
  return { deps, socket, queryClient };
}

describe('`message:consumed` met la bulle à jour EN DIRECT (#7354)', () => {
  test('le fil ouvert de la conversation voit son viewOnceCount bouger, sans recharger', () => {
    const { deps, socket, queryClient } = buildDeps();
    const target = localMessage({ id: 'm-1', conversationId: 'c-a', isViewOnce: true, viewOnceCount: 0 });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([target]));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.MESSAGE_CONSUMED, {
      messageId: 'm-1',
      conversationId: 'c-a',
      userId: 'u-other',
      viewOnceCount: 1,
      maxViewOnceCount: 1,
      isFullyConsumed: true,
    });

    const messages = queryClient.getQueryData<ReturnType<typeof threadPages>>(messagesQueryKey('c-a'))?.pages[0]?.messages;
    expect(messages?.find((m) => m.id === 'm-1')?.viewOnceCount).toBe(1);
  });

  test('une charge mal formée (sans messageId) est ignorée, aucune exception', () => {
    const { deps, socket, queryClient } = buildDeps();
    const target = localMessage({ id: 'm-1', conversationId: 'c-a', isViewOnce: true, viewOnceCount: 0 });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([target]));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    expect(() => socket.fire(SERVER_EVENTS.MESSAGE_CONSUMED, { conversationId: 'c-a' })).not.toThrow();

    const messages = queryClient.getQueryData<ReturnType<typeof threadPages>>(messagesQueryKey('c-a'))?.pages[0]?.messages;
    expect(messages?.find((m) => m.id === 'm-1')?.viewOnceCount).toBe(0);
  });
});
