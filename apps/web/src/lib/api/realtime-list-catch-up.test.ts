import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { createOutboxStore } from '@/lib/send/outbox-store';
import { localMessage } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import type { ConversationsPage } from './conversations-pages';
import { applyConversationUpdated, applyMessageNew } from './realtime-apply';
import type { Conversation, Message } from './types';

/**
 * #9637 — « les derniers messages reçus disparaissent » de la LISTE, sur le
 * web et dans la coque Android. Une relecture de la liste partie AVANT un
 * message remplaçait le cache par sa réponse : l'aperçu que le temps réel
 * venait de poser revenait au message précédent. #9291 a fermé ce trou pour
 * le fil ; ces témoins le ferment pour la ligne de liste. Un VRAI
 * `QueryClient`, un vrai observateur (la liste ouverte), et une `queryFn` qui
 * sert ce que le serveur tient au moment de l'appel.
 */

const older = localMessage({ id: 'm-0', conversationId: 'c-a', senderId: 'u-other', content: 'avant', createdAt: new Date('2026-10-07T06:00:00.000Z') });
const fresh = localMessage({ id: 'm-1', conversationId: 'c-a', senderId: 'u-other', content: 'arrivé', createdAt: new Date('2026-10-07T06:01:00.000Z') });

const rowWith = (last: Message): Conversation =>
  ({
    id: 'c-a',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    unreadCount: 0,
    lastMessage: last,
    lastMessageAt: last.createdAt,
  }) as Conversation;

const pageOf = (rows: readonly Conversation[]): ConversationsPage => ({
  conversations: rows,
  pagination: { limit: 30, offset: 0, total: rows.length, hasMore: false },
  cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
});

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

type Deferred = { readonly promise: Promise<ConversationsPage>; readonly resolve: (page: ConversationsPage) => void };

const deferred = (): Deferred => {
  let resolve: (page: ConversationsPage) => void = () => undefined;
  const promise = new Promise<ConversationsPage>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

type Server = { calls: number; respond: () => Promise<ConversationsPage> };

function openList(client: QueryClient, server: Server): () => void {
  const observer = new InfiniteQueryObserver(client, {
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: () => {
      server.calls += 1;
      return server.respond();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: () => undefined,
    staleTime: 0,
  });
  return observer.subscribe(() => undefined);
}

const settle = async (client: QueryClient): Promise<void> => {
  for (let i = 0; i < 20 && client.isFetching() > 0; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const lastIdOf = (client: QueryClient): string | undefined =>
  client
    .getQueryData<{ readonly pages: readonly ConversationsPage[] }>(CONVERSATIONS_QUERY_KEY)
    ?.pages.flatMap((p) => p.conversations)
    .find((c) => c.id === 'c-a')?.lastMessage?.id;

const seeded = (): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [pageOf([rowWith(older)])], pageParams: [undefined] });
  return client;
};

/** La première réponse reste en vol et sert l'état d'AVANT le message ; les
 * suivantes servent l'état courant, qui le contient. */
const serverAround = (inFlight: Deferred): Server => {
  const server: Server = {
    calls: 0,
    respond: () => (server.calls === 1 ? inFlight.promise : Promise.resolve(pageOf([rowWith(fresh)]))),
  };
  return server;
};

describe('#9637 — un aperçu posé par le temps réel survit à une relecture de la liste en vol', () => {
  test('message:new : la réponse partie avant le message ne remet pas l’ancien aperçu', async () => {
    const client = seeded();
    const inFlight = deferred();
    const server = serverAround(inFlight);
    const unsubscribe = openList(client, server);
    expect(client.getQueryState(CONVERSATIONS_QUERY_KEY)?.fetchStatus).toBe('fetching');

    applyMessageNew(client, createOutboxStore(), socketMessage(fresh));
    expect(lastIdOf(client)).toBe('m-1');

    inFlight.resolve(pageOf([rowWith(older)]));
    await settle(client);

    expect(lastIdOf(client)).toBe('m-1');
    unsubscribe();
  });

  test('conversation:updated : l’aperçu adopté pendant la relecture survit à sa réponse', async () => {
    const client = seeded();
    const inFlight = deferred();
    const server = serverAround(inFlight);
    const unsubscribe = openList(client, server);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-other' },
      updatedAt: '2026-10-07T06:01:00.050Z',
      lastMessageId: 'm-1',
      lastMessageAt: '2026-10-07T06:01:00.000Z',
      lastMessagePreview: 'arrivé',
      senderId: 'u-other',
    } as ConversationUpdatedEventData);
    expect(lastIdOf(client)).toBe('m-1');

    inFlight.resolve(pageOf([rowWith(older)]));
    await settle(client);

    expect(lastIdOf(client)).toBe('m-1');
    unsubscribe();
  });

  test('sans relecture en vol, le temps réel ne déclenche aucune requête de liste', async () => {
    const client = seeded();
    const server: Server = { calls: 0, respond: () => Promise.resolve(pageOf([rowWith(fresh)])) };
    const unsubscribe = openList(client, server);
    await settle(client);
    const before = server.calls;

    applyMessageNew(client, createOutboxStore(), socketMessage(localMessage({ ...fresh, id: 'm-2', createdAt: new Date('2026-10-07T06:02:00.000Z') })));
    await settle(client);

    expect(server.calls).toBe(before);
    expect(lastIdOf(client)).toBe('m-2');
    unsubscribe();
  });
});
