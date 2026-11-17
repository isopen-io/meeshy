import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { CommentMediaUpdatedEventData, PostComment as SharedPostComment } from '@meeshy/shared/types/post';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { commentPrism } from '@/lib/comments/comment-prism';
import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import type { FeedMedia } from './feed-pages';
import { commentsQueryKey, type CommentInfiniteData, type PostComment } from './publication-comments';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * **LE VOCAL D'UN COMMENTAIRE REÇOIT SA TRANSCRIPTION EN DIRECT** (#18921,
 * WEB-15 volet commentaires). La passerelle diffuse `comment:media-updated`
 * dès que le pipeline audio d'un média de commentaire a transcrit et traduit
 * (`SocialEventsHandler.broadcastCommentMediaUpdated`) ; aucun écouteur web ne
 * le recevait : la transcription n'apparaissait qu'à la relecture du fil.
 *
 * Chaque témoin lit ce que la rangée SERT (`commentPrism`, la descente que la
 * rangée appelle à chaque peinture) et le prisme a DEUX rangs, la langue servie
 * étant celle du second : au rang 1, la règle juste et le court-circuit interdit
 * rendent le même verdict (leçon 261).
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
  createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient };
}

const FLUSH_TIMEOUT_MS = 2000;
const flush = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + FLUSH_TIMEOUT_MS;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (condition() || Date.now() >= deadline) return;
  }
};

/** L'ABSENCE se prouve par une attente fixe : l'`import()` d'un module déjà résolu tient en quelques tours. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 30));

const PRISM = ['fr', 'en'] as const;

const author = { id: 'u-noa', displayName: 'Noa Berger', username: 'noa' };

const vocal = (patch: Partial<FeedMedia> = {}): FeedMedia => ({ id: 'm-voc', mimeType: 'audio/webm', fileUrl: 'voc.webm', duration: 4200, ...patch });

/** Un commentaire VOCAL, sans texte, encore sans transcription — tel que le fil le tient. */
const voiceComment = (id: string, patch: Partial<PostComment> = {}): PostComment => ({
  id,
  content: '',
  createdAt: '2026-11-17T10:00:00.000Z',
  author,
  originalLanguage: 'es',
  isLikedByMe: true,
  likeCount: 3,
  media: [vocal()],
  ...patch,
});

const thread = (comments: readonly PostComment[]): CommentInfiniteData => ({
  pages: [{ comments, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

const TRANSCRIPTION = { type: 'audio', transcribedText: 'Hola a todos', language: 'es', confidence: 0.92 } as const;
const TRACKS = {
  en: { type: 'audio', transcription: 'Hello everyone', url: 'voc.en.mp3', format: 'mp3', durationMs: 4100 },
  de: { type: 'audio', transcription: 'Hallo zusammen', url: 'voc.de.mp3', format: 'mp3', durationMs: 4300 },
} as const;

/** La charge de la passerelle : le commentaire RELU, son média transcrit et traduit, sans ce qui se lit par lecteur. */
const delivery = (commentId: string, postId = 'p-1'): CommentMediaUpdatedEventData =>
  ({
    postId,
    commentId,
    comment: {
      id: commentId,
      content: '',
      createdAt: '2026-11-17T10:00:00.000Z',
      author,
      originalLanguage: 'es',
      likeCount: 3,
      media: [{ ...vocal(), transcription: TRANSCRIPTION, translations: TRACKS }],
    } as unknown as SharedPostComment,
  }) as CommentMediaUpdatedEventData;

const rowOf = (queryClient: QueryClient, commentId: string, key: readonly unknown[] = commentsQueryKey('p-1')): PostComment | undefined =>
  queryClient
    .getQueryData<CommentInfiniteData>(key)
    ?.pages.flatMap((page) => page.comments)
    .find((comment) => comment.id === commentId);

const servedLanguageOf = (comment: PostComment | undefined): string | undefined =>
  comment === undefined ? undefined : commentPrism({ comment, readerLanguages: PRISM, displayLanguage: null }).servedLanguage;

describe('`comment:media-updated` — le vocal d’un commentaire reçoit sa transcription en direct (#18921)', () => {
  test('la transcription et les pistes se posent sur le média en cache, et la rangée sert la piste de RANG 2', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([voiceComment('c-1')]));

    socket.fire(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, delivery('c-1'));
    await flush(() => rowOf(queryClient, 'c-1')?.media?.[0]?.transcription != null);

    const media = rowOf(queryClient, 'c-1')?.media?.[0];
    expect(media?.transcription).toEqual(TRANSCRIPTION);
    expect(media?.translations).toEqual(TRACKS);
    expect(servedLanguageOf(rowOf(queryClient, 'c-1'))).toBe('en');
  });

  test('ce qui appartient au lecteur et le reste de la rangée ne bougent pas', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([voiceComment('c-1', { isLikedByMe: true, currentUserReactions: ['🔥'] })]));

    socket.fire(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, delivery('c-1'));
    await flush(() => rowOf(queryClient, 'c-1')?.media?.[0]?.transcription != null);

    const row = rowOf(queryClient, 'c-1');
    expect(row?.isLikedByMe).toBe(true);
    expect(row?.currentUserReactions).toEqual(['🔥']);
    expect(row?.media?.[0]?.fileUrl).toBe('voc.webm');
    expect(row?.media?.[0]?.duration).toBe(4200);
  });

  test('une RÉPONSE, dans sa propre caisse, reçoit aussi sa transcription', async () => {
    const { socket, queryClient } = connected();
    const repliesKey = [...commentsQueryKey('p-1'), 'replies', 'c-parent'] as const;
    queryClient.setQueryData(repliesKey, thread([voiceComment('c-reponse', { parentId: 'c-parent' })]));

    socket.fire(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, delivery('c-reponse'));
    await flush(() => rowOf(queryClient, 'c-reponse', repliesKey)?.media?.[0]?.transcription != null);

    expect(rowOf(queryClient, 'c-reponse', repliesKey)?.media?.[0]?.transcription).toEqual(TRANSCRIPTION);
  });

  test('un commentaire absent du fil, ou une charge illisible, ne réécrit rien', async () => {
    const { socket, queryClient } = connected();
    const held = thread([voiceComment('c-1')]);
    queryClient.setQueryData(commentsQueryKey('p-1'), held);

    socket.fire(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, delivery('c-ailleurs'));
    socket.fire(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, { postId: 'p-1', commentId: 'c-1' });
    socket.fire(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, null);
    await settled();

    expect(queryClient.getQueryData(commentsQueryKey('p-1'))).toBe(held);
  });
});
