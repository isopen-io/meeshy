import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { STATUS_MOODS_QUERY_KEY, STORY_TRAY_QUERY_KEY, type StatusMoodPost } from './stories';
import { createTypingStore } from './typing-store';

/**
 * **L'HUMEUR D'UN AMI, POSÉE, CHANGÉE OU RETIRÉE, SE VOIT EN DIRECT** (#18914,
 * WEB-05) — les humeurs vivent sous `['stories', 'moods']`, que lisent le rail,
 * la pastille des avatars et la feuille d'humeur ; seul `status:updated` était
 * écouté, et il ne périmait que le PLATEAU des stories. `status:created` et
 * `status:deleted` n'avaient aucun écouteur, et une reconnexion ne relisait pas
 * les humeurs.
 */

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

function connected() {
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

const mood = (partial: Partial<StatusMoodPost> = {}): StatusMoodPost => ({ id: 'st-1', authorId: 'u-ami', moodEmoji: '🎉', ...partial });

const isInvalidated = (queryClient: QueryClient, queryKey: readonly unknown[]): boolean =>
  queryClient.getQueryState(queryKey)?.isInvalidated === true;

describe('status:* — les humeurs suivent la passerelle (WEB-05)', () => {
  test('`status:created` périme les humeurs', () => {
    const { socket, queryClient, destroy } = connected();
    queryClient.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, []);

    socket.fire(SERVER_EVENTS.STATUS_CREATED, { status: mood() });

    expect(isInvalidated(queryClient, STATUS_MOODS_QUERY_KEY)).toBe(true);
    destroy();
  });

  test('`status:updated` périme les humeurs ET le plateau des stories', () => {
    const { socket, queryClient, destroy } = connected();
    queryClient.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, [mood()]);
    queryClient.setQueryData(STORY_TRAY_QUERY_KEY, []);

    socket.fire(SERVER_EVENTS.STATUS_UPDATED, { status: mood({ moodEmoji: '☕' }) });

    expect(isInvalidated(queryClient, STATUS_MOODS_QUERY_KEY)).toBe(true);
    expect(isInvalidated(queryClient, STORY_TRAY_QUERY_KEY)).toBe(true);
    destroy();
  });

  test('`status:deleted` périme les humeurs', () => {
    const { socket, queryClient, destroy } = connected();
    queryClient.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, [mood()]);

    socket.fire(SERVER_EVENTS.STATUS_DELETED, { statusId: 'st-1', authorId: 'u-ami' });

    expect(isInvalidated(queryClient, STATUS_MOODS_QUERY_KEY)).toBe(true);
    destroy();
  });

  test('après `destroy`, plus aucun `status:*` n’est écouté', () => {
    const { socket, queryClient, destroy } = connected();
    queryClient.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, [mood()]);
    destroy();

    socket.fire(SERVER_EVENTS.STATUS_CREATED, { status: mood({ id: 'st-2' }) });
    socket.fire(SERVER_EVENTS.STATUS_DELETED, { statusId: 'st-1', authorId: 'u-ami' });

    expect(isInvalidated(queryClient, STATUS_MOODS_QUERY_KEY)).toBe(false);
  });

  test('une RECONNEXION relit les humeurs — jamais la première authentification', () => {
    const { socket, queryClient, destroy } = connected();
    queryClient.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, [mood()]);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    expect(isInvalidated(queryClient, STATUS_MOODS_QUERY_KEY)).toBe(false);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    expect(isInvalidated(queryClient, STATUS_MOODS_QUERY_KEY)).toBe(true);
    destroy();
  });
});
