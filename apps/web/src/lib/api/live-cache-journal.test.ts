import { InfiniteQueryObserver, QueryObserver, type QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';
import type { TranscriptionReadyEventData } from '@meeshy/shared/types/socketio-events/audio';
import type { AttachmentReactionUpdateEventData } from '@meeshy/shared/types/socketio-events/reaction';
import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';

import { conversationStore } from '@/lib/conversation-store';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { liveQueryClient } from '@/test-support/live-query-client';
import { routedTransport } from '@/test-support/routed-transport';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY, conversationQuery, findCachedConversation } from './conversations';
import type { ConversationsPage } from './conversations-pages';
import { applyConversationGone } from './realtime-conversation-gone';
import { LIVE_CACHE_ROOT } from './live-cache-journal';
import { messagesQueryKey } from './messages';
import type { MessagesPage, MessagesPageParam } from './messages-pages';
import { applyConversationUnreadUpdated, applyMessageNew, applyMessageTranslation } from './realtime-apply';
import { applyAttachmentReactionUpdate } from './realtime-attachment-reactions';
import { applyMessageDeleted } from './realtime-message-mutations';
import { applyTranscriptionReady } from './realtime-transcription-ready';
import { performReaction } from './reactions';
import { reactionStore } from './reaction-store';
import type { Attachment, Conversation, Message } from './types';

/**
 * **UNE ÉCRITURE TEMPS RÉEL N'EST JAMAIS ÉCRASÉE PAR UNE RELECTURE PARTIE AVANT
 * ELLE** (#18914, WEB-04 et M1). TanStack remplace le cache par la réponse
 * d'une relecture, partie AVANT ce que le temps réel vient d'écrire : un
 * message supprimé ressuscitait, un compte de non-lus soldé revenait à 5. Le
 * remède d'avant — relancer la relecture à chaque écriture — ne couvrait que
 * trois écrivains, relançait sans fin sous un flux de messages, et annulait la
 * page plus ancienne qu'on remontait.
 *
 * Le journal : une écriture vive faite pendant une relecture est rejouée SUR
 * sa réponse, dans `structuralSharing` — avant que le moindre observateur ne la
 * voie —, puis oubliée. Un delta RELATIF (ma réaction, +1) n'est jamais rejoué :
 * la réponse le compte peut-être déjà.
 */

type Deferred<T> = { readonly promise: Promise<T>; readonly resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  const handle: { resolve: (value: T) => void } = { resolve: () => undefined };
  const promise = new Promise<T>((resolve) => {
    handle.resolve = resolve;
  });
  return { promise, resolve: (value) => handle.resolve(value) };
}

const settle = async (queryClient: QueryClient): Promise<void> => {
  for (let i = 0; i < 40 && queryClient.isFetching() > 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const pageOf = (messages: readonly Message[], cursor: string | null = null): MessagesPage => ({ messages, hasOlder: cursor !== null, nextCursor: cursor });

const row = (partial: Partial<Conversation> = {}): Conversation =>
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

const listPage = (rows: readonly Conversation[]): ConversationsPage => ({
  conversations: rows,
  pagination: { limit: 30, offset: 0, total: rows.length, hasMore: false },
  cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
});

const socketMessage = (id: string, conversationId = 'c-a'): SocketIOMessage =>
  ({
    id,
    conversationId,
    senderId: 'u-other',
    content: 'nouveau',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: '2026-11-17T10:00:05.000Z',
  }) as unknown as SocketIOMessage;

/** Le fil OUVERT : un observateur abonné ; la `queryFn` sert ce que le serveur tient à l'appel. */
function openThread(queryClient: QueryClient, respond: (pageParam: MessagesPageParam) => Promise<MessagesPage>) {
  const calls: MessagesPageParam[] = [];
  const observer = new InfiniteQueryObserver(queryClient, {
    queryKey: messagesQueryKey('c-a'),
    queryFn: ({ pageParam }: { readonly pageParam: MessagesPageParam }) => {
      calls.push(pageParam);
      return respond(pageParam);
    },
    initialPageParam: undefined as MessagesPageParam,
    getNextPageParam: (last: MessagesPage) => last.nextCursor ?? undefined,
    staleTime: 0,
  });
  return { observer, calls, stop: observer.subscribe(() => undefined) };
}

function openList(queryClient: QueryClient, respond: () => Promise<ConversationsPage>) {
  const calls = { count: 0 };
  const observer = new InfiniteQueryObserver(queryClient, {
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: () => {
      calls.count += 1;
      return respond();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: () => undefined,
    staleTime: 0,
  });
  return { calls, stop: observer.subscribe(() => undefined) };
}

const seedList = (queryClient: QueryClient, rows: readonly Conversation[]): void => {
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [listPage(rows)], pageParams: [undefined] });
};

describe('WEB-04 — une écriture temps réel survit à une relecture EN VOL', () => {
  test('message:deleted pendant la relecture du fil : le message ne ressuscite pas, et l’observateur ne le revoit jamais vivant', async () => {
    const queryClient = liveQueryClient();
    const victim = localMessage({ id: 'm-1', senderId: 'u-other', content: 'à supprimer' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([victim]));
    const inFlight = deferred<MessagesPage>();
    const { observer, stop } = openThread(queryClient, () => inFlight.promise);
    const seen: string[] = [];
    const unwatch = observer.subscribe((result) => {
      const first = result.data?.pages[0]?.messages[0];
      seen.push(first?.deletedAt === undefined || first.deletedAt === null ? 'vivant' : 'tombe');
    });

    applyMessageDeleted(queryClient, { messageId: 'm-1', conversationId: 'c-a', deletedAt: '2026-11-17T10:00:00.000Z' });
    inFlight.resolve(pageOf([victim]));
    await settle(queryClient);

    expect(threadOf(queryClient, 'c-a')?.messages[0]?.deletedAt).toBeDefined();
    expect(seen.slice(seen.indexOf('tombe'))).not.toContain('vivant');
    unwatch();
    stop();
  });

  test('conversation:unread-updated pendant la relecture de la liste : le compte servi ne revient pas en arrière', async () => {
    const queryClient = liveQueryClient();
    seedList(queryClient, [row({ unreadCount: 5 })]);
    const inFlight = deferred<ConversationsPage>();
    const { stop } = openList(queryClient, () => inFlight.promise);

    applyConversationUnreadUpdated(queryClient, conversationStore, { conversationId: 'c-a', unreadCount: 0 });
    inFlight.resolve(listPage([row({ unreadCount: 5 })]));
    await settle(queryClient);

    expect(findCachedConversation(queryClient, 'c-a')?.unreadCount).toBe(0);
    stop();
  });

  test('une écriture d’un AUTRE module pendant la relecture ne consomme pas le journal', async () => {
    const queryClient = liveQueryClient();
    seedList(queryClient, [row({ unreadCount: 5 }), row({ id: 'c-b' })]);
    const inFlight = deferred<ConversationsPage>();
    const { stop } = openList(queryClient, () => inFlight.promise);

    applyConversationUnreadUpdated(queryClient, conversationStore, { conversationId: 'c-a', unreadCount: 0 });
    applyConversationGone(queryClient, 'c-b');
    inFlight.resolve(listPage([row({ unreadCount: 5 })]));
    await settle(queryClient);

    expect(findCachedConversation(queryClient, 'c-a')?.unreadCount).toBe(0);
    stop();
  });

  test('une traduction reçue pendant la relecture se pose SUR la réponse : le texte que la réponse sert reste', async () => {
    const queryClient = liveQueryClient();
    const before = localMessage({ id: 'm-1', senderId: 'u-other', content: 'avant' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([before]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);
    const english = { id: 't-1', messageId: 'm-1', sourceLanguage: 'fr', targetLanguage: 'en', translatedContent: 'edited', translationModel: 'nllb', cacheKey: 'k-1', cached: false };

    applyMessageTranslation(queryClient, { messageId: 'm-1', translations: [english] } as TranslationEvent);
    inFlight.resolve(pageOf([localMessage({ ...before, content: 'édité', isEdited: true })]));
    await settle(queryClient);

    const served = threadOf(queryClient, 'c-a')?.messages[0];
    expect(served?.content).toBe('édité');
    expect(served?.translations.map((t) => t.targetLanguage)).toEqual(['en']);
    stop();
  });

  test('une transcription ou une réaction de pièce reçue pendant la relecture se pose SUR la réponse, sans défaire ce qu’elle sert', async () => {
    const queryClient = liveQueryClient();
    const piece = { id: 'a-1', mimeType: 'audio/webm', fileUrl: 'a-1.webm' } as unknown as Attachment;
    const vocal = localMessage({ id: 'm-voc', senderId: 'u-other', messageType: 'audio', readCount: 0, attachments: [piece] });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([vocal]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    applyTranscriptionReady(queryClient, {
      conversationId: 'c-a',
      messageId: 'm-voc',
      attachmentId: 'a-1',
      transcription: { text: 'bonjour', language: 'fr' },
    } as TranscriptionReadyEventData);
    applyAttachmentReactionUpdate(
      queryClient,
      { conversationId: 'c-a', messageId: 'm-voc', attachmentId: 'a-1', emoji: '🔥', action: 'add', userId: 'u-other', reactionSummary: { '🔥': 1 } } as AttachmentReactionUpdateEventData,
      'u-viewer',
    );
    inFlight.resolve(pageOf([localMessage({ ...vocal, readCount: 3 })]));
    await settle(queryClient);

    const served = threadOf(queryClient, 'c-a')?.messages[0];
    expect(served?.readCount).toBe(3);
    expect(served?.attachments?.[0]?.transcription?.transcribedText).toBe('bonjour');
    expect(served?.attachments?.[0]?.reactionSummary).toEqual({ '🔥': 1 });
    stop();
  });

  test('un delta RELATIF (ma réaction) n’est jamais rejoué : la réponse qui le compte déjà ne le double pas', async () => {
    reactionStore.setState({ mine: {} });
    const queryClient = liveQueryClient();
    const message = localMessage({ id: 'm-react', senderId: 'u-other', reactionSummary: { '❤️': 1 } });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([message]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);
    const { transport } = routedTransport((req) => (req.method === 'POST' ? { ok: true, status: 201, data: {} } : undefined));

    await performReaction({ conversationId: 'c-a', messageId: 'm-react', emoji: '❤️', deps: { source: 'gateway', transport, queryClient } });
    inFlight.resolve(pageOf([localMessage({ ...message, reactionSummary: { '❤️': 2 } })]));
    await settle(queryClient);

    expect(threadOf(queryClient, 'c-a')?.messages[0]?.reactionSummary).toEqual({ '❤️': 2 });
    reactionStore.setState({ mine: {} });
    stop();
  });
});

describe('M1 — remonter un fil actif : un message reçu n’annule plus la page plus ancienne', () => {
  test('fetchNextPage en vol + message:new : la page ancienne arrive ET le message reste, un seul appel', async () => {
    const queryClient = liveQueryClient();
    const recent = localMessage({ id: 'm-recent', senderId: 'u-other' });
    const older = localMessage({ id: 'm-older', senderId: 'u-other' });
    queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [pageOf([recent], 'm-recent')], pageParams: [undefined] });
    const olderPage = deferred<MessagesPage>();
    const { observer, calls, stop } = openThread(queryClient, (pageParam) =>
      pageParam === 'm-recent' ? olderPage.promise : Promise.resolve(pageOf([recent], 'm-recent')),
    );
    await settle(queryClient);
    calls.length = 0;

    const loadOlder = observer.fetchNextPage();
    applyMessageNew(queryClient, createOutboxStore(), socketMessage('m-new'));
    olderPage.resolve(pageOf([older]));
    await loadOlder;
    await settle(queryClient);

    const ids = threadOf(queryClient, 'c-a')?.messages.map((m) => m.id) ?? [];
    expect(ids).toContain('m-older');
    expect(ids).toContain('m-new');
    expect(calls).toEqual(['m-recent']);
    stop();
  });
});

describe('la relecture n’est plus relancée à chaque message', () => {
  test('cinq message:new pendant une relecture de la liste : UN appel, et sa réponse se pose', async () => {
    const queryClient = liveQueryClient();
    seedList(queryClient, [row({ id: 'c-global' })]);
    const inFlight = deferred<ConversationsPage>();
    const { calls, stop } = openList(queryClient, () => inFlight.promise);

    for (const index of [1, 2, 3, 4, 5]) applyMessageNew(queryClient, createOutboxStore(), socketMessage(`m-${index}`, 'c-global'));
    inFlight.resolve(listPage([row({ id: 'c-global', title: 'Global' })]));
    await settle(queryClient);

    expect(calls.count).toBe(1);
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.fetchStatus).toBe('idle');
    expect(findCachedConversation(queryClient, 'c-global')?.title).toBe('Global');
    expect(findCachedConversation(queryClient, 'c-global')?.lastMessage?.id).toBe('m-5');
    stop();
  });
});

describe('une écriture temps réel ne fait pas passer le cache pour frais (WEB-08, résidu)', () => {
  test('la liste garde la date de sa dernière lecture serveur', () => {
    const queryClient = liveQueryClient();
    const servedAt = Date.now() - 60_000;
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [listPage([row()])], pageParams: [undefined] }, { updatedAt: servedAt });

    applyMessageNew(queryClient, createOutboxStore(), socketMessage('m-1'));

    expect(findCachedConversation(queryClient, 'c-a')?.lastMessage?.id).toBe('m-1');
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.dataUpdatedAt).toBe(servedAt);
  });

  test('ouvrir un fil juste après un message:new d’une AUTRE conversation relit sa fiche', async () => {
    const queryClient = liveQueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [listPage([row(), row({ id: 'c-autre' })])], pageParams: [undefined] }, { updatedAt: Date.now() - 60_000 });
    applyMessageNew(queryClient, createOutboxStore(), socketMessage('m-1', 'c-autre'));
    const { transport, calls } = routedTransport(() => ({ ok: true, data: row() }));

    const observer = new QueryObserver(queryClient, conversationQuery({ source: 'gateway', transport }, 'c-a', { queryClient }));
    const stop = observer.subscribe(() => undefined);
    await settle(queryClient);

    expect(calls()).toHaveLength(1);
    stop();
  });
});

describe('le journal vit sous la racine des conversations', () => {
  test('sa racine est celle de la liste, de la fiche et du fil', () => {
    expect(LIVE_CACHE_ROOT).toEqual(CONVERSATIONS_QUERY_KEY);
  });
});
