import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { storyCitationOf } from '@/lib/view/message-body';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';
import type { Message } from './types';

/**
 * **`message:cited-post-withdrawn` EST ÉCOUTÉ** (#7969) — la LOI vit dans
 * `realtime-cited-post.ts` ; ce témoin garde le BRANCHEMENT : retirer le
 * `socket.on` le fait tomber (même doctrine que `socket-starred-realtime.test.ts`).
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

function connect(): { readonly socket: ReturnType<typeof fakeSocket>; readonly queryClient: QueryClient; readonly destroy: () => void } {
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

type CitingMessage = Message & { readonly postReplyTo?: unknown };

const citing = (): CitingMessage =>
  localMessage({
    id: 'm-reply',
    senderId: 'u-other',
    content: 'Trop beau !',
    storyReplyToId: 'story-1',
    postReplyTo: { id: 'story-1', type: 'STORY', previewText: 'Plage', thumbnailUrl: 'https://cdn/t.jpg', moodEmoji: null, createdAt: '2026-09-24T18:00:00.000Z' },
  } as Partial<Message>) as CitingMessage;

const citation = (queryClient: QueryClient) =>
  storyCitationOf(threadOf(queryClient, 'c-a')?.messages.find((m) => m.id === 'm-reply') as CitingMessage);

const payload = { conversationId: 'c-a', postId: 'story-1', deletedAt: '2026-09-25T10:00:00.000Z' };

describe('`message:cited-post-withdrawn` — la carte passe indisponible, fil ouvert', () => {
  test('l’événement reçu rend la citation indisponible', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([citing()]));

    socket.fire(SERVER_EVENTS.MESSAGE_CITED_POST_WITHDRAWN, payload);

    expect(citation(queryClient)?.unavailable).toBe(true);
    destroy();
  });

  test('détruite, la connexion n’écoute plus', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([citing()]));
    destroy();

    socket.fire(SERVER_EVENTS.MESSAGE_CITED_POST_WITHDRAWN, payload);

    expect(citation(queryClient)?.unavailable).toBe(false);
  });
});
