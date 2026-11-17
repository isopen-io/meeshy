import { InfiniteQueryObserver, type QueryClient } from '@tanstack/react-query';

import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { ConversationsPage } from '@/lib/api/conversations-pages';
import { messagesQueryKey } from '@/lib/api/messages';
import { threadWindowOf, type MessagesPage, type MessagesPageParam } from '@/lib/api/messages-pages';
import type { Conversation, Message } from '@/lib/api/types';
import { routedTransport } from '@/test-support/routed-transport';
import { threadOf } from '@/test-support/thread-cache';

/**
 * **UNE RELECTURE EN VOL, TELLE QUE L'APPLICATION L'OBSERVE** (#18914,
 * #19082) — le banc des témoins du journal des écritures vives
 * (`live-cache-journal.ts`) : le fil et la liste ouverts par de VRAIS
 * observateurs, une réponse que le témoin libère quand il veut, et les
 * fabriques des rangées que la passerelle sert. Écrit une fois pour les
 * témoins des écritures temps réel ET pour ceux des gestes optimistes.
 */

export type Deferred<T> = { readonly promise: Promise<T>; readonly resolve: (value: T) => void };

export function deferred<T>(): Deferred<T> {
  const handle: { resolve: (value: T) => void } = { resolve: () => undefined };
  const promise = new Promise<T>((resolve) => {
    handle.resolve = resolve;
  });
  return { promise, resolve: (value) => handle.resolve(value) };
}

export const settle = async (queryClient: QueryClient): Promise<void> => {
  for (let i = 0; i < 40 && queryClient.isFetching() > 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

export const pageOf = (messages: readonly Message[], cursor: string | null = null): MessagesPage => ({ messages, hasOlder: cursor !== null, nextCursor: cursor });

export const row = (partial: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c-a',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

export const listPage = (rows: readonly Conversation[]): ConversationsPage => ({
  conversations: rows,
  pagination: { limit: 30, offset: 0, total: rows.length, hasMore: false },
  cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
});

export const socketMessage = (id: string, conversationId = 'c-a'): SocketIOMessage =>
  ({
    id,
    conversationId,
    senderId: 'u-other',
    content: 'nouveau',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: '2026-11-17T10:00:05.000Z',
  }) as unknown as SocketIOMessage;

/** `201` pour une réaction NEUVE : un `200` dit « elle existait déjà », et `performReaction` défait alors son +1. */
export const answering = (method: string, status = 200) =>
  routedTransport((req) => (req.method === method ? { ok: true, status, data: {} } : undefined)).transport;

/** Une passerelle qui REFUSE la méthode (`status` 0 : réseau coupé ; 403 : refus). */
export const refusing = (method: string, status = 500) =>
  routedTransport((req) => (req.method === method ? { ok: false, status, error: 'refus' } : undefined)).transport;

/**
 * Le fil OUVERT, tel que l'application l'observe : la fenêtre aplatie par
 * `threadWindowOf` en `select` — TanStack rappelle alors `structuralSharing`
 * sur la valeur SÉLECTIONNÉE. La `queryFn` sert ce que le serveur tient à l'appel.
 */
export function openThread(queryClient: QueryClient, respond: (pageParam: MessagesPageParam) => Promise<MessagesPage>) {
  const calls: MessagesPageParam[] = [];
  const observer = new InfiniteQueryObserver(queryClient, {
    queryKey: messagesQueryKey('c-a'),
    queryFn: ({ pageParam }: { readonly pageParam: MessagesPageParam }) => {
      calls.push(pageParam);
      return respond(pageParam);
    },
    initialPageParam: undefined as MessagesPageParam,
    getNextPageParam: (last: MessagesPage) => last.nextCursor ?? undefined,
    select: threadWindowOf,
    staleTime: 0,
  });
  return { observer, calls, stop: observer.subscribe(() => undefined) };
}

export function openList(queryClient: QueryClient, respond: (call: number) => Promise<ConversationsPage>) {
  const calls = { count: 0 };
  const observer = new InfiniteQueryObserver(queryClient, {
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: () => {
      calls.count += 1;
      return respond(calls.count);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: () => undefined,
    staleTime: 0,
  });
  return { calls, stop: observer.subscribe(() => undefined) };
}

export const seedList = (queryClient: QueryClient, rows: readonly Conversation[]): void => {
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [listPage(rows)], pageParams: [undefined] });
};

export const servedRow = (queryClient: QueryClient, id: string): Message | undefined => threadOf(queryClient, 'c-a')?.messages.find((m) => m.id === id);
