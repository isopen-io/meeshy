import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { applyMessagePinnedEvent, applyMessageUnpinnedEvent, isMessagePinnedEvent, isMessageUnpinnedEvent } from './realtime-message-pin';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * #7558 — UN ÉPINGLAGE FAIT AILLEURS SE VOIT SANS RECHARGEMENT. La passerelle
 * diffuse `message:pinned` / `message:unpinned` à la salle de la conversation
 * (`broadcastMessageMutation`, `messages-pin.ts`). Les témoins lisent le cache
 * que la rangée peint — c'est lui qui porte le badge (`badgesOf`).
 */

const PINNED_AT = '2026-10-14T10:00:00.000Z';

const seeded = (): QueryClient => {
  const queryClient = new QueryClient();
  const row = (id: string, conversationId = 'c-a') => localMessage({ id, conversationId, content: `texte ${id}`, senderId: 'u-other' });
  queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([row('m-1'), row('m-2')]));
  queryClient.setQueryData(messagesQueryKey('c-b'), threadPages([row('m-9', 'c-b')]));
  return queryClient;
};

const rowOf = (queryClient: QueryClient, conversationId: string, id: string) => threadOf(queryClient, conversationId)?.messages.find((m) => m.id === id);

const pinned = (messageId: string, conversationId = 'c-a') => ({ messageId, conversationId, pinnedAt: PINNED_AT, pinnedBy: 'u-other' });

describe('le puits — la rangée prend ou perd son épingle', () => {
  test('`message:pinned` pose l’heure et l’auteur de l’épingle sur la rangée nommée, et seulement elle', () => {
    const queryClient = seeded();
    applyMessagePinnedEvent(queryClient, pinned('m-2'));
    expect(rowOf(queryClient, 'c-a', 'm-2')?.pinnedAt).toEqual(new Date(PINNED_AT));
    expect(rowOf(queryClient, 'c-a', 'm-2')?.pinnedBy).toBe('u-other');
    expect(rowOf(queryClient, 'c-a', 'm-1')?.pinnedAt).toBeUndefined();
  });

  test('`message:unpinned` retire l’épingle — la clé disparaît, comme le décodeur le fait d’un `null`', () => {
    const queryClient = seeded();
    applyMessagePinnedEvent(queryClient, pinned('m-2'));
    applyMessageUnpinnedEvent(queryClient, { messageId: 'm-2', conversationId: 'c-a' });
    const row = rowOf(queryClient, 'c-a', 'm-2');
    expect(row !== undefined && 'pinnedAt' in row).toBe(false);
    expect(row !== undefined && 'pinnedBy' in row).toBe(false);
  });

  test('une rangée d’une autre conversation n’est jamais touchée', () => {
    const queryClient = seeded();
    applyMessagePinnedEvent(queryClient, pinned('m-9', 'c-a'));
    expect(rowOf(queryClient, 'c-b', 'm-9')?.pinnedAt).toBeUndefined();
  });

  test('rejoué (l’auteur du geste reçoit aussi l’écho), il ne change rien', () => {
    const queryClient = seeded();
    applyMessagePinnedEvent(queryClient, pinned('m-2'));
    const after = queryClient.getQueryData(messagesQueryKey('c-a'));
    applyMessagePinnedEvent(queryClient, pinned('m-2'));
    expect(threadOf(queryClient, 'c-a')?.messages[1]).toBe((after as { pages: { messages: unknown[] }[] }).pages[0]?.messages[1]);
  });
});

describe('les gardes — la charge est relue', () => {
  test('la forme servie passe', () => {
    expect(isMessagePinnedEvent(pinned('m-1'))).toBe(true);
    expect(isMessageUnpinnedEvent({ messageId: 'm-1', conversationId: 'c-a' })).toBe(true);
  });

  test('une charge incomplète ou à l’heure illisible est refusée', () => {
    expect(isMessagePinnedEvent(null)).toBe(false);
    expect(isMessagePinnedEvent({ messageId: 'm-1', conversationId: 'c-a', pinnedBy: 'u' })).toBe(false);
    expect(isMessagePinnedEvent({ ...pinned('m-1'), pinnedAt: 'hier' })).toBe(false);
    expect(isMessageUnpinnedEvent({ messageId: 'm-1' })).toBe(false);
  });
});

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

describe('le branchement — `socket.ts` écoute `message:pinned` et `message:unpinned`', () => {
  const connected = () => {
    const socket = fakeSocket();
    const socketFactory: SocketFactory = () => socket;
    const queryClient = seeded();
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
  };

  test('un épinglage fait par l’autre participant apparaît, puis disparaît, sans rechargement', () => {
    const { socket, queryClient, destroy } = connected();
    socket.fire(SERVER_EVENTS.MESSAGE_PINNED, pinned('m-1'));
    expect(rowOf(queryClient, 'c-a', 'm-1')?.pinnedAt).toEqual(new Date(PINNED_AT));
    socket.fire(SERVER_EVENTS.MESSAGE_UNPINNED, { messageId: 'm-1', conversationId: 'c-a' });
    expect(rowOf(queryClient, 'c-a', 'm-1')?.pinnedAt).toBeUndefined();
    destroy();
  });

  test('après `destroy`, l’événement n’est plus écouté', () => {
    const { socket, queryClient, destroy } = connected();
    destroy();
    socket.fire(SERVER_EVENTS.MESSAGE_PINNED, pinned('m-1'));
    expect(rowOf(queryClient, 'c-a', 'm-1')?.pinnedAt).toBeUndefined();
  });
});
