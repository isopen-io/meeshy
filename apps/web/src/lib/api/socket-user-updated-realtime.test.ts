import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { UserUpdatedEventData } from '@meeshy/shared/types/socketio-events/user';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * **`user:updated` EST ÉCOUTÉ** (#8889, #8890) — la passerelle prévient les
 * co-participants quand un profil change ; le web ne l'écoutait pas, si bien
 * qu'un pair ne voyait la nouvelle photo ou le nouveau nom qu'à sa prochaine
 * relecture. La LOI vit dans `my-portrait.ts` (`repaintProfile`) ; ce témoin
 * garde le BRANCHEMENT : retirer le `socket.on` le fait tomber.
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

const KWAME = 'u-kwame';

const seed = (queryClient: QueryClient) =>
  queryClient.setQueryData(['conversations'], {
    pages: [
      {
        conversations: [
          {
            id: 'c-direct',
            type: 'direct',
            participants: [
              { id: 'p-kwame', userId: KWAME, displayName: 'Kwame', avatar: null, user: { id: KWAME, username: 'kwame', displayName: 'Kwame', avatar: 'old.webp' } },
            ],
          },
        ],
      },
    ],
    pageParams: [null],
  });

type Row = { readonly displayName: string; readonly user: Record<string, unknown> & { readonly avatar: string } };
const kwameOf = (queryClient: QueryClient) =>
  queryClient.getQueryData<{ pages: { conversations: { participants: Row[] }[] }[] }>(['conversations'])?.pages[0]?.conversations[0]?.participants[0];

describe('user:updated — la photo et le nom d’un pair arrivent sans relecture', () => {
  test('une nouvelle photo repeint chaque copie du pair', () => {
    const { socket, queryClient } = connect();
    seed(queryClient);

    const payload: UserUpdatedEventData = { userId: KWAME, changes: { avatar: 'new.webp' } };
    socket.fire(SERVER_EVENTS.USER_UPDATED, payload);

    expect(kwameOf(queryClient)?.user.avatar).toBe('new.webp');
  });

  test('un nouveau nom (le groupe des quatre composants) renomme le participant et son compte', () => {
    const { socket, queryClient } = connect();
    seed(queryClient);

    const payload: UserUpdatedEventData = {
      userId: KWAME,
      changes: { displayName: 'Kwame M.', firstName: 'Kwame', lastName: 'Mensah', username: 'kwame_m' },
    };
    socket.fire(SERVER_EVENTS.USER_UPDATED, payload);

    expect(kwameOf(queryClient)?.displayName).toBe('Kwame M.');
    expect(kwameOf(queryClient)?.user).toMatchObject({ displayName: 'Kwame M.', username: 'kwame_m' });
  });

  test('un nom PARTIEL (sans le marqueur `username`) est irrecomposable : il ne renomme rien', () => {
    const { socket, queryClient } = connect();
    seed(queryClient);
    socket.fire(SERVER_EVENTS.USER_UPDATED, { userId: KWAME, changes: { displayName: 'Bob' } });
    expect(kwameOf(queryClient)?.displayName).toBe('Kwame');
  });

  test('ce que la charge porterait À CÔTÉ des champs publics n’entre dans aucun cache', () => {
    const { socket, queryClient } = connect();
    queryClient.setQueryData(['profile', KWAME], { id: KWAME, avatar: 'old.webp', email: null, isOnline: false });
    socket.fire(SERVER_EVENTS.USER_UPDATED, { userId: KWAME, changes: { avatar: 'new.webp', email: 'k@x.io', isOnline: true } });
    expect(queryClient.getQueryData(['profile', KWAME])).toEqual({ id: KWAME, avatar: 'new.webp', email: null, isOnline: false });
  });

  test('une charge malformée est ignorée', () => {
    const { socket, queryClient } = connect();
    seed(queryClient);
    const before = queryClient.getQueryData(['conversations']);
    socket.fire(SERVER_EVENTS.USER_UPDATED, { changes: { avatar: 'x.webp' } });
    socket.fire(SERVER_EVENTS.USER_UPDATED, { userId: KWAME });
    socket.fire(SERVER_EVENTS.USER_UPDATED, null);
    expect(queryClient.getQueryData(['conversations'])).toBe(before);
  });

  test('détruire la connexion retire l’écoute', () => {
    const { socket, queryClient, destroy } = connect();
    seed(queryClient);
    destroy();
    socket.fire(SERVER_EVENTS.USER_UPDATED, { userId: KWAME, changes: { avatar: 'new.webp' } });
    expect(kwameOf(queryClient)?.user.avatar).toBe('old.webp');
  });
});
