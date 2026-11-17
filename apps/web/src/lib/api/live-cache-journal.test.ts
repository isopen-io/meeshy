import { InfiniteQueryObserver, QueryObserver, onlineManager, type QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';
import type { TranscriptionReadyEventData } from '@meeshy/shared/types/socketio-events/audio';
import type { AttachmentReactionUpdateEventData } from '@meeshy/shared/types/socketio-events/reaction';
import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';

import { conversationStore } from '@/lib/conversation-store';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { E2EE_PLAINTEXT_SENTINEL, sentinelLeaks } from '@/test-support/e2ee-plaintext-sentinel';
import { liveQueryClient } from '@/test-support/live-query-client';
import { routedTransport } from '@/test-support/routed-transport';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { performDeparture } from './conversation-departure';
import { CONVERSATIONS_QUERY_KEY, conversationQuery, conversationQueryKey, findCachedConversation, patchConversationDetail } from './conversations';
import type { ConversationsPage } from './conversations-pages';
import { performDeleteForMe } from './delete-message';
import { messagesQueryKey, upsertThreadMessage } from './messages';
import { threadWindowOf, type MessagesPage, type MessagesPageParam } from './messages-pages';
import {
  applyConversationUnreadUpdated,
  applyMessageAttachmentUpdated,
  applyMessageNew,
  applyMessageTranslation,
  applyReadStatusUpdated,
} from './realtime-apply';
import { applyAttachmentReactionUpdate } from './realtime-attachment-reactions';
import { applyConversationGone } from './realtime-conversation-gone';
import { applyMessageDeleted } from './realtime-message-mutations';
import { applyMessageReactionUpdate, isMessageReactionUpdate } from './realtime-message-reactions';
import { applyTranscriptionReady } from './realtime-transcription-ready';
import { createAppQueryClient, type StorageLike } from './query-client';
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
 * voie —, puis oubliée. Seule la RÉPONSE le rejoue : une écriture ordinaire
 * faite pendant le vol le porte sans le rejouer. Un delta RELATIF (ma
 * réaction, +1) n'y entre jamais : la réponse le compte peut-être déjà.
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

/** `201` pour une réaction NEUVE : un `200` dit « elle existait déjà », et `performReaction` défait alors son +1. */
const answering = (method: string, status = 200) => routedTransport((req) => (req.method === method ? { ok: true, status, data: {} } : undefined)).transport;

/**
 * Le fil OUVERT, tel que l'application l'observe : la fenêtre aplatie par
 * `threadWindowOf` en `select` — TanStack rappelle alors `structuralSharing`
 * sur la valeur SÉLECTIONNÉE. La `queryFn` sert ce que le serveur tient à l'appel.
 */
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
    select: threadWindowOf,
    staleTime: 0,
  });
  return { observer, calls, stop: observer.subscribe(() => undefined) };
}

function openList(queryClient: QueryClient, respond: (call: number) => Promise<ConversationsPage>) {
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

const seedList = (queryClient: QueryClient, rows: readonly Conversation[]): void => {
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [listPage(rows)], pageParams: [undefined] });
};

const servedRow = (queryClient: QueryClient, id: string): Message | undefined => threadOf(queryClient, 'c-a')?.messages.find((m) => m.id === id);

const DELETION = { messageId: 'm-1', conversationId: 'c-a', deletedAt: '2026-11-17T10:00:00.000Z' } as const;

describe('WEB-04 — une écriture temps réel survit à une relecture EN VOL', () => {
  test('message:deleted pendant la relecture du fil : le message ne ressuscite pas', async () => {
    const queryClient = liveQueryClient();
    const victim = localMessage({ id: 'm-1', senderId: 'u-other', content: 'à supprimer' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([victim]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    applyMessageDeleted(queryClient, DELETION);
    inFlight.resolve(pageOf([victim]));
    await settle(queryClient);

    expect(servedRow(queryClient, 'm-1')?.deletedAt).toBeDefined();
    stop();
  });

  test('l’observateur ne revoit jamais la rangée vivante après la pierre tombale', async () => {
    const queryClient = liveQueryClient();
    const victim = localMessage({ id: 'm-1', senderId: 'u-other', content: 'à supprimer' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([victim]));
    const inFlight = deferred<MessagesPage>();
    const { observer, stop } = openThread(queryClient, () => inFlight.promise);
    const seen: string[] = [];
    const unwatch = observer.subscribe((result) => {
      const first = result.data?.messages[0];
      seen.push(first?.deletedAt === undefined || first.deletedAt === null ? 'vivant' : 'tombe');
    });

    applyMessageDeleted(queryClient, DELETION);
    inFlight.resolve(pageOf([victim]));
    await settle(queryClient);

    expect(seen).toContain('tombe');
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

  test('une conversation supprimée pour moi ailleurs pendant la relecture de la liste n’y revient pas', async () => {
    const queryClient = liveQueryClient();
    seedList(queryClient, [row(), row({ id: 'c-b' })]);
    const inFlight = deferred<ConversationsPage>();
    const { stop } = openList(queryClient, () => inFlight.promise);

    applyConversationGone(queryClient, 'c-b');
    inFlight.resolve(listPage([row(), row({ id: 'c-b' })]));
    await settle(queryClient);

    expect(findCachedConversation(queryClient, 'c-a')).toBeDefined();
    expect(findCachedConversation(queryClient, 'c-b')).toBeUndefined();
    stop();
  });

  test('une traduction reçue pendant la relecture se pose SUR la réponse : le texte que la réponse sert reste', async () => {
    const queryClient = liveQueryClient();
    const before = localMessage({ id: 'm-1', senderId: 'u-other', content: 'avant' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([before]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);
    const translated: TranslationEvent = {
      messageId: 'm-1',
      translations: [{ id: 't-1', messageId: 'm-1', sourceLanguage: 'fr', targetLanguage: 'en', translatedContent: 'edited', translationModel: 'nllb', cacheKey: 'k-1', cached: false }],
    };

    applyMessageTranslation(queryClient, translated);
    inFlight.resolve(pageOf([localMessage({ ...before, content: 'édité', isEdited: true })]));
    await settle(queryClient);

    const served = servedRow(queryClient, 'm-1');
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

    const transcribed: TranscriptionReadyEventData = {
      conversationId: 'c-a',
      messageId: 'm-voc',
      attachmentId: 'a-1',
      transcription: { id: 't-1', text: 'bonjour', language: 'fr' },
    };
    const reacted: AttachmentReactionUpdateEventData = {
      conversationId: 'c-a',
      messageId: 'm-voc',
      attachmentId: 'a-1',
      participantId: 'p-other',
      userId: 'u-other',
      emoji: '🔥',
      action: 'add',
      reactionSummary: { '🔥': 1 },
      timestamp: '2026-11-17T10:00:01.000Z',
    };

    applyTranscriptionReady(queryClient, transcribed);
    applyAttachmentReactionUpdate(queryClient, reacted, 'u-viewer');
    inFlight.resolve(pageOf([localMessage({ ...vocal, readCount: 3 })]));
    await settle(queryClient);

    const served = servedRow(queryClient, 'm-voc');
    expect(served?.readCount).toBe(3);
    expect(served?.attachments?.[0]?.transcription).toMatchObject({ type: 'audio', transcribedText: 'bonjour' });
    expect(served?.attachments?.[0]?.reactionSummary).toEqual({ '🔥': 1 });
    stop();
  });

  test('une réaction, une pièce enrichie ou un accusé reçus pendant la relecture se posent SUR la réponse, sans défaire ce qu’elle sert', async () => {
    const queryClient = liveQueryClient();
    const piece = { id: 'a-1', messageId: 'm-1', mimeType: 'audio/wav', fileUrl: 'a-1.wav' } as unknown as Attachment;
    /* Le cache d'un onglet qui se réveille : la version d'AVANT l'édition, que la relecture vient corriger. */
    const cached = localMessage({ id: 'm-1', senderId: 'u-viewer', content: 'avant', deliveredCount: 0, readCount: 0, attachments: [piece] });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([cached]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);
    const reaction: Record<string, unknown> = {
      messageId: 'm-1',
      conversationId: 'c-a',
      participantId: 'p-other',
      userId: 'u-other',
      emoji: '🔥',
      action: 'add',
      aggregation: { emoji: '🔥', count: 2, participantIds: ['p-other', 'p-third'] },
      timestamp: '2026-11-17T10:00:01.000Z',
    };
    if (!isMessageReactionUpdate(reaction)) throw new Error('charge de réaction invalide');

    applyMessageReactionUpdate(queryClient, reaction, 'u-viewer');
    applyMessageAttachmentUpdated(queryClient, {
      conversationId: 'c-a',
      messageId: 'm-1',
      attachment: { id: 'a-1', messageId: 'm-1', mimeType: 'audio/wav', fileUrl: 'a-1.wav', transcription: { type: 'audio', text: 'bonjour', language: 'fr' }, translations: null },
    });
    applyReadStatusUpdated(queryClient, {
      conversationId: 'c-a',
      participantId: 'p-other',
      userId: 'u-other',
      type: 'read',
      updatedAt: new Date('2026-11-17T10:00:02.000Z'),
      summary: { totalMembers: 3, deliveredCount: 2, readCount: 1, messageId: 'm-1' },
    });
    inFlight.resolve(pageOf([localMessage({ ...cached, content: 'édité', isEdited: true, deliveredCount: 1, readCount: 0 })]));
    await settle(queryClient);

    const served = servedRow(queryClient, 'm-1');
    expect(served?.content).toBe('édité');
    expect(served?.isEdited).toBe(true);
    expect(served?.reactionSummary).toEqual({ '🔥': 2 });
    expect(served?.attachments?.[0]?.transcription).toEqual({ type: 'audio', text: 'bonjour', language: 'fr' });
    expect(served?.deliveredCount).toBe(2);
    expect(served?.readCount).toBe(1);
    expect(served?.recipientCount).toBe(3);
    stop();
  });

  test('l’écho de MA réaction, reçu pendant la relecture, survit à une réponse partie avant elle', async () => {
    reactionStore.setState({ mine: {} });
    const queryClient = liveQueryClient();
    const message = localMessage({ id: 'm-1', senderId: 'u-other', reactionSummary: {} });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([message]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);
    const echo: Record<string, unknown> = {
      messageId: 'm-1',
      conversationId: 'c-a',
      participantId: 'p-viewer',
      userId: 'u-viewer',
      emoji: '❤️',
      action: 'add',
      aggregation: { emoji: '❤️', count: 1, participantIds: ['p-viewer'] },
      timestamp: '2026-11-17T10:00:01.000Z',
    };
    if (!isMessageReactionUpdate(echo)) throw new Error('charge de réaction invalide');

    await performReaction({ conversationId: 'c-a', messageId: 'm-1', emoji: '❤️', deps: { source: 'gateway', transport: answering('POST', 201), queryClient } });
    applyMessageReactionUpdate(queryClient, echo, 'u-viewer');
    inFlight.resolve(pageOf([message]));
    await settle(queryClient);

    expect(servedRow(queryClient, 'm-1')?.reactionSummary).toEqual({ '❤️': 1 });
    reactionStore.setState({ mine: {} });
    stop();
  });

  test('un message reçu puis masqué pour moi pendant la relecture du fil ne revient ni sur-le-champ ni à la réponse', async () => {
    const queryClient = liveQueryClient();
    const older = localMessage({ id: 'm-0', senderId: 'u-other' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([older]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    applyMessageNew(queryClient, createOutboxStore(), socketMessage('m-x'));
    const received = servedRow(queryClient, 'm-x');
    if (received === undefined) throw new Error('le message reçu doit être dans le fil');
    await performDeleteForMe({ queryClient, conversationId: 'c-a', messages: [received], transport: answering('DELETE') });

    expect(servedRow(queryClient, 'm-x')).toBeUndefined();
    inFlight.resolve(pageOf([older, received]));
    await settle(queryClient);

    expect(servedRow(queryClient, 'm-x')).toBeUndefined();
    expect(servedRow(queryClient, 'm-0')).toBeDefined();
    stop();
  });
});

describe('le journal ne se rejoue que sur la réponse, et la garde jusqu’à elle', () => {
  test('un geste hors du journal pendant la relecture (quitter une autre conversation) ne le consomme pas', async () => {
    const queryClient = liveQueryClient();
    seedList(queryClient, [row({ unreadCount: 5 }), row({ id: 'c-b' })]);
    const inFlight = deferred<ConversationsPage>();
    const { stop } = openList(queryClient, () => inFlight.promise);

    applyConversationUnreadUpdated(queryClient, conversationStore, { conversationId: 'c-a', unreadCount: 0 });
    await performDeparture({ conversationId: 'c-b', kind: 'leave', online: true, deps: { source: 'gateway', transport: answering('POST'), queryClient } });
    inFlight.resolve(listPage([row({ unreadCount: 5 })]));
    await settle(queryClient);

    expect(findCachedConversation(queryClient, 'c-a')?.unreadCount).toBe(0);
    stop();
  });

  test('une écriture hors du journal pendant la relecture n’est pas défaite sur-le-champ par un rejeu', () => {
    const queryClient = liveQueryClient();
    seedList(queryClient, [row({ unreadCount: 5 })]);
    const inFlight = deferred<ConversationsPage>();
    const { stop } = openList(queryClient, () => inFlight.promise);

    applyConversationUnreadUpdated(queryClient, conversationStore, { conversationId: 'c-a', unreadCount: 0 });
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [listPage([row({ unreadCount: 4 })])], pageParams: [undefined] });

    expect(findCachedConversation(queryClient, 'c-a')?.unreadCount).toBe(4);
    inFlight.resolve(listPage([row({ unreadCount: 5 })]));
    stop();
  });

  test('ma réaction (un delta) pendant la relecture ne fait pas oublier ce que le temps réel a écrit avant elle', async () => {
    reactionStore.setState({ mine: {} });
    const queryClient = liveQueryClient();
    const victim = localMessage({ id: 'm-1', senderId: 'u-other', content: 'à supprimer' });
    const liked = localMessage({ id: 'm-2', senderId: 'u-other', reactionSummary: {} });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([victim, liked]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    applyMessageDeleted(queryClient, DELETION);
    await performReaction({ conversationId: 'c-a', messageId: 'm-2', emoji: '❤️', deps: { source: 'gateway', transport: answering('POST', 201), queryClient } });
    inFlight.resolve(pageOf([victim, liked]));
    await settle(queryClient);

    expect(servedRow(queryClient, 'm-1')?.deletedAt).toBeDefined();
    reactionStore.setState({ mine: {} });
    stop();
  });

  test('un delta RELATIF (ma réaction) n’est jamais rejoué : la réponse qui le compte déjà ne le double pas', async () => {
    reactionStore.setState({ mine: {} });
    const queryClient = liveQueryClient();
    const message = localMessage({ id: 'm-react', senderId: 'u-other', reactionSummary: { '❤️': 1 } });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([message]));
    const inFlight = deferred<MessagesPage>();
    const { stop } = openThread(queryClient, () => inFlight.promise);

    await performReaction({ conversationId: 'c-a', messageId: 'm-react', emoji: '❤️', deps: { source: 'gateway', transport: answering('POST', 201), queryClient } });
    inFlight.resolve(pageOf([localMessage({ ...message, reactionSummary: { '❤️': 2 } })]));
    await settle(queryClient);

    expect(servedRow(queryClient, 'm-react')?.reactionSummary).toEqual({ '❤️': 2 });
    reactionStore.setState({ mine: {} });
    stop();
  });

  test('une relecture partie APRÈS l’écriture la contient déjà : sa réponse, plus récente, n’est pas réécrite par le journal', async () => {
    const queryClient = liveQueryClient();
    seedList(queryClient, [row({ unreadCount: 5 })]);
    const first = deferred<ConversationsPage>();
    const { calls, stop } = openList(queryClient, (call) => (call === 1 ? first.promise : Promise.resolve(listPage([row({ unreadCount: 3 })]))));

    applyConversationUnreadUpdated(queryClient, conversationStore, { conversationId: 'c-a', unreadCount: 0 });
    await queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY, exact: true });
    first.resolve(listPage([row({ unreadCount: 5 })]));
    await settle(queryClient);

    expect(calls.count).toBe(2);
    expect(findCachedConversation(queryClient, 'c-a')?.unreadCount).toBe(3);
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

/**
 * **HORS LIGNE, LA RACINE RESTE EN PAUSE** (#18914, audit C1). Le crochet
 * `persister` du journal fait passer TanStack en `offlineFirst` quand rien ne
 * fixe le mode réseau : hors ligne, la requête partait, le service worker
 * servait sa copie (sept jours) et elle remplaçait le cache — un message reçu
 * disparaissait, un supprimé revenait. Le dépôt repose sur « hors ligne ⇒ en
 * pause » (`lib/view/cold-state.ts`). Mesuré sur le client de l'APPLICATION.
 */
describe('hors ligne, la racine des conversations reste EN PAUSE', () => {
  const memoryStorage = (): StorageLike => {
    const data = new Map<string, string>();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };
  };
  const appClient = () => createAppQueryClient({ buster: 'test:journal', storage: memoryStorage() });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  test('la liste, la fiche et le fil gardent le mode réseau « online », crochet du journal compris', async () => {
    const queryClient = appClient();
    await queryClient.liveJournal;

    const modes = [CONVERSATIONS_QUERY_KEY, conversationQueryKey('c-a'), messagesQueryKey('c-a')].map(
      (queryKey) => queryClient.defaultQueryOptions({ queryKey }).networkMode,
    );

    expect(modes).toEqual(['online', 'online', 'online']);
  });

  test('ouvrir un fil hors ligne attend le réseau : aucune copie ancienne ne remplace ce que le temps réel a posé', async () => {
    const queryClient = appClient();
    await queryClient.liveJournal;
    const read = localMessage({ id: 'm-lu', senderId: 'u-other' });
    const received = localMessage({ id: 'm-recu', senderId: 'u-other' });
    queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([read, received]));
    onlineManager.setOnline(false);

    const { calls, stop } = openThread(queryClient, () => Promise.resolve(pageOf([read])));
    await settle(queryClient);

    expect(calls).toHaveLength(0);
    expect(queryClient.getQueryState(messagesQueryKey('c-a'))?.fetchStatus).toBe('paused');
    expect(threadOf(queryClient, 'c-a')?.messages.map((m) => m.id)).toEqual(['m-lu', 'm-recu']);
    stop();
    queryClient.clear();
  });
});

/**
 * **LE JOURNAL N'OUVRE AUCUN CHEMIN VERS LE DISQUE** (#18914, #18991). Son
 * crochet `persister` ne range rien : il marque la réponse, en mémoire. Un
 * clair déchiffré posé dans le fil d'une conversation fermée au clair par une
 * écriture VIVE, puis rejoué sur la réponse d'une relecture, reste en mémoire
 * et n'entre jamais dans le cache rangé (`estFilScelle`, `query-client.ts` ;
 * liste noire `lib/e2ee/durable-plaintext-sinks.ts`).
 */
describe('le journal et le fil d’une conversation fermée au clair', () => {
  test('une écriture vive pendant la relecture, puis son rejeu sur la réponse, gardent le clair en mémoire et hors du cache rangé', async () => {
    const sealed = 'c-scellee-journal';
    endToEndRegimeLedger.getState().learnEndToEnd(sealed, 1);
    const raw = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (key) => raw.get(key) ?? null,
      setItem: (key, value) => {
        raw.set(key, value);
      },
      removeItem: (key) => {
        raw.delete(key);
      },
    };
    const queryClient = createAppQueryClient({ buster: 'test:journal-scelle', storage });
    await queryClient.liveJournal;
    const before = localMessage({ id: 'm-0', conversationId: sealed, senderId: 'u-other', content: 'avant' });
    queryClient.setQueryData(messagesQueryKey(sealed), threadPages([before]));
    queryClient.setQueryData(messagesQueryKey('c-claire-journal'), threadPages([localMessage({ id: 'm-clair', conversationId: 'c-claire-journal', content: 'bonjour en clair' })]));
    const inFlight = deferred<MessagesPage>();
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: messagesQueryKey(sealed),
      queryFn: () => inFlight.promise,
      initialPageParam: undefined as MessagesPageParam,
      getNextPageParam: () => undefined,
      staleTime: 0,
    });
    const stop = observer.subscribe(() => undefined);

    upsertThreadMessage(queryClient, sealed, localMessage({ id: 'm-dechiffre', conversationId: sealed, senderId: 'u-other', content: E2EE_PLAINTEXT_SENTINEL }));
    inFlight.resolve(pageOf([before]));
    await settle(queryClient);
    queryClient.persist();

    expect(threadOf(queryClient, sealed)?.messages.map((m) => m.content)).toContain(E2EE_PLAINTEXT_SENTINEL);
    const written = [...raw.values()].join('');
    expect(sentinelLeaks({ 'meeshy.query-cache': written })).toEqual([]);
    expect(written).toContain('bonjour en clair');
    stop();
  });
});

describe('le journal vit sous la racine des conversations', () => {
  test('la fiche d’une conversation en est : une écriture vive pendant sa relecture survit à la réponse', async () => {
    const queryClient = liveQueryClient();
    queryClient.setQueryData(conversationQueryKey('c-a'), row({ title: 'Avant' }));
    const inFlight = deferred<Conversation>();
    const observer = new QueryObserver(queryClient, { queryKey: conversationQueryKey('c-a'), queryFn: () => inFlight.promise, staleTime: 0 });
    const stop = observer.subscribe(() => undefined);

    patchConversationDetail(queryClient, 'c-a', (conversation) => ({ ...conversation, title: 'Renommée' }));
    inFlight.resolve(row({ title: 'Avant' }));
    await settle(queryClient);

    expect(queryClient.getQueryData<Conversation>(conversationQueryKey('c-a'))?.title).toBe('Renommée');
    stop();
  });
});
