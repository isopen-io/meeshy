import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { createOutboxStore } from '@/lib/send/outbox-store';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import type { MessagesPage } from './messages-pages';
import { applyMessageNew } from './realtime-apply';
import { catchUpThreadMessage } from './realtime-thread-catch-up';
import type { Message } from './types';

/**
 * #9291 — « la notification arrive, le message n'est pas dans le fil ». Les
 * témoins jouent un VRAI `QueryClient` et un vrai observateur (le fil ouvert),
 * et une `queryFn` qui sert ce que le serveur tient au moment de l'appel.
 */

const older = localMessage({ id: 'm-0', senderId: 'u-other', createdAt: new Date('2026-10-04T06:00:00.000Z') });
const fresh = localMessage({ id: 'm-1', senderId: 'u-other', content: 'arrivé', createdAt: new Date('2026-10-04T06:01:00.000Z') });

const pageOf = (messages: readonly Message[]): MessagesPage => ({ messages, hasOlder: false, nextCursor: null });

const socketMessage = (message: Message): SocketIOMessage =>
  ({
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    originalLanguage: message.originalLanguage,
    messageType: message.messageType,
    createdAt: (message.createdAt as Date).toISOString(),
  }) as unknown as SocketIOMessage;

type Deferred = { readonly promise: Promise<MessagesPage>; readonly resolve: (page: MessagesPage) => void };

const deferred = (): Deferred => {
  let resolve: (page: MessagesPage) => void = () => undefined;
  const promise = new Promise<MessagesPage>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

/** Le serveur : ce que la queryFn sert dépend de l'appel — la première
 * réponse peut rester en vol, les suivantes servent l'état courant. */
function openThread(client: QueryClient, server: { calls: number; respond: () => Promise<MessagesPage> }) {
  const observer = new InfiniteQueryObserver(client, {
    queryKey: messagesQueryKey('c-a'),
    queryFn: () => {
      server.calls += 1;
      return server.respond();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: () => undefined,
    staleTime: 0,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  return { observer, unsubscribe };
}

const settle = async (client: QueryClient): Promise<void> => {
  for (let i = 0; i < 20 && client.isFetching() > 0; i += 1) await new Promise((r) => setTimeout(r, 0));
};

describe('#9291 — un message:new reçu PENDANT une requête du fil survit à sa réponse', () => {
  test('la réponse partie avant le message ne l’efface pas du fil ouvert', async () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([older]));
    const inFlight = deferred();
    const server = {
      calls: 0,
      respond: (): Promise<MessagesPage> =>
        server.calls === 1 ? inFlight.promise : Promise.resolve(pageOf([older, fresh])),
    };
    const { unsubscribe } = openThread(client, server);

    expect(client.getQueryState(messagesQueryKey('c-a'))?.fetchStatus).toBe('fetching');
    applyMessageNew(client, createOutboxStore(), socketMessage(fresh));
    inFlight.resolve(pageOf([older]));
    await settle(client);

    expect(threadOf(client, 'c-a')?.messages.map((m) => m.id)).toEqual(['m-0', 'm-1']);
    unsubscribe();
  });

  test('sans requête en vol, le temps réel ne déclenche AUCUNE relecture', async () => {
    const client = new QueryClient();
    const server = { calls: 0, respond: (): Promise<MessagesPage> => Promise.resolve(pageOf([older])) };
    const { unsubscribe } = openThread(client, server);
    await settle(client);
    const before = server.calls;

    applyMessageNew(client, createOutboxStore(), socketMessage(fresh));
    await settle(client);

    expect(server.calls).toBe(before);
    expect(threadOf(client, 'c-a')?.messages.map((m) => m.id)).toEqual(['m-0', 'm-1']);
    unsubscribe();
  });
});

describe('#9291 — catchUpThreadMessage : un signal personnel qui nomme un message absent relit le fil', () => {
  test('message absent du fil ouvert ⇒ le fil est relu et le message apparaît', async () => {
    const client = new QueryClient();
    const served = { messages: [older] as readonly Message[] };
    const server = { calls: 0, respond: (): Promise<MessagesPage> => Promise.resolve(pageOf(served.messages)) };
    const { unsubscribe } = openThread(client, server);
    await settle(client);

    served.messages = [older, fresh];
    catchUpThreadMessage(client, { conversationId: 'c-a', messageId: 'm-1' });
    await settle(client);

    expect(threadOf(client, 'c-a')?.messages.map((m) => m.id)).toEqual(['m-0', 'm-1']);
    unsubscribe();
  });

  test('message déjà dans le fil ⇒ aucune requête', async () => {
    const client = new QueryClient();
    const server = { calls: 0, respond: (): Promise<MessagesPage> => Promise.resolve(pageOf([older, fresh])) };
    const { unsubscribe } = openThread(client, server);
    await settle(client);
    const before = server.calls;

    catchUpThreadMessage(client, { conversationId: 'c-a', messageId: 'm-1' });
    await settle(client);

    expect(server.calls).toBe(before);
    unsubscribe();
  });

  test('fil jamais ouvert ⇒ rien n’est construit ni demandé', () => {
    const client = new QueryClient();
    catchUpThreadMessage(client, { conversationId: 'c-jamais', messageId: 'm-1' });
    expect(client.getQueryData(messagesQueryKey('c-jamais'))).toBeUndefined();
  });
});
