import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { commentsQueryKey } from './publication-comments';
import { reelsQueryKey } from './reels';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { STORY_FEED_QUERY_KEY, type StoryFeedPost } from './stories';
import { createTypingStore } from './typing-store';

/**
 * **W8 (#7227) — LES RÉELS APPRENNENT CE QUE LE FLUX APPREND, ET LES
 * RÉACTIONS/ÉDITIONS/SUPPRESSIONS ARRIVENT EN DIRECT.**
 *
 * `socket.test.ts` porte déjà 1099 lignes pour un budget de 1200 (CLAUDE.md
 * racine, § Code Style) : ajouter les huit écoutes de ce lot ici l'aurait
 * dépassé. Ce fichier est l'EXTRACTION par responsabilité que la règle
 * demande — même patron que `feed-realtime.test.ts` / `socket.test.ts`
 * (`fakeSocket`, `buildDeps`), pour les événements de RÉACTION/ÉDITION que
 * `post:*` et `comment:added` (#7182, #7151) n'ouvraient pas :
 * `story:reacted`/`story:unreacted`, `comment:updated`/`comment:deleted`/
 * `comment:liked`/`comment:unliked`, `post:reaction-added`/
 * `post:reaction-removed`, et l'écriture des Réels par `post:liked`/
 * `post:unliked`/`post:deleted`.
 *
 * **L'ÉPREUVE DE CHAQUE TÉMOIN N'EST PAS SON VERT mais sa MUTATION** — retirer
 * le `socket.on` correspondant doit le faire TOMBER (même doctrine que les
 * témoins `comment:added`/`post:created` de `socket.test.ts`).
 */

function fakeSocket(): SocketClient & {
  fire(event: string, payload: unknown): void;
} {
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

function buildDeps(overrides: Partial<RealtimeDeps> = {}): {
  readonly deps: RealtimeDeps;
  readonly socket: ReturnType<typeof fakeSocket>;
  readonly queryClient: QueryClient;
} {
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
    ...overrides,
  };
  return { deps, socket, queryClient };
}

/** L'APPLICATION DE `story:*` / `comment:*` ARRIVE PAR `import()` (D-98) :
 * elle se résout en micro-tâches, jamais dans le tour du `fire`. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const feedWith = (partial: Partial<FeedPost>): FeedInfiniteData => ({
  pages: [
    { posts: [{ id: 'p-1', type: 'POST', createdAt: '2026-09-21T10:00:00.000Z', ...partial }], pagination: { limit: 20, hasMore: false, nextCursor: null } },
  ],
  pageParams: [undefined],
});

const story = (patch: Partial<StoryFeedPost> = {}): StoryFeedPost => ({
  id: 'st-1',
  type: 'STORY',
  createdAt: '2026-09-21T09:00:00.000Z',
  reactionCount: 2,
  currentUserReactions: [],
  ...patch,
});

describe('`post:liked` / `post:unliked` écrivent AUSSI les RÉELS (#7227)', () => {
  test('`post:liked` d’un AUTRE pose le compte servi dans les Réels, sans remplir mon cœur', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(reelsQueryKey(), feedWith({ isLikedByMe: false, likeCount: 3 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_LIKED, { postId: 'p-1', userId: 'u-other', emoji: '❤️', likeCount: 7, reactionSummary: {} });

    const reel = queryClient.getQueryData<FeedInfiniteData>(reelsQueryKey())?.pages[0]?.posts[0];
    expect(reel?.likeCount).toBe(7);
    expect(reel?.isLikedByMe).toBe(false);
  });

  test('`post:liked` DU LECTEUR (autre appareil) remplit le cœur dans les Réels aussi', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(reelsQueryKey('seed-r'), feedWith({ isLikedByMe: false, likeCount: 3 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_LIKED, { postId: 'p-1', userId: 'u-viewer', emoji: '❤️', likeCount: 4, reactionSummary: {} });

    const reel = queryClient.getQueryData<FeedInfiniteData>(reelsQueryKey('seed-r'))?.pages[0]?.posts[0];
    expect(reel?.isLikedByMe).toBe(true);
    expect(reel?.likeCount).toBe(4);
  });

  test('le FLUX bouge toujours, exactement comme avant ce lot', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(FEED_QUERY_KEY, feedWith({ isLikedByMe: false, likeCount: 3 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_UNLIKED, { postId: 'p-1', userId: 'u-viewer', emoji: '❤️', likeCount: 2, reactionSummary: {} });

    expect(queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0]?.likeCount).toBe(2);
  });
});

describe('`story:reacted` / `story:unreacted` sont ÉCOUTÉS (#7227)', () => {
  test('`story:reacted` pose le compte servi ET mon cœur si c’est moi (autre appareil)', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story()]);
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.STORY_REACTED, { storyId: 'st-1', userId: 'u-viewer', emoji: '❤️', likeCount: 3, reactionSummary: {} });
    await flush();

    const st = queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === 'st-1');
    expect(st?.reactionCount).toBe(3);
    expect(st?.currentUserReactions).toEqual(['❤️']);
  });

  test('`story:unreacted` pose le compte servi', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story({ currentUserReactions: ['❤️'], reactionCount: 3 })]);
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.STORY_UNREACTED, { storyId: 'st-1', userId: 'u-other', emoji: '❤️', likeCount: 2, reactionSummary: {} });
    await flush();

    const st = queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === 'st-1');
    expect(st?.reactionCount).toBe(2);
    /* SA réaction à LUI n'est pas la mienne — mon cœur ne bouge pas. */
    expect(st?.currentUserReactions).toEqual(['❤️']);
  });

  test('`destroy` démonte les DEUX écoutes', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story()]);
    const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    connection.destroy();

    socket.fire(SERVER_EVENTS.STORY_REACTED, { storyId: 'st-1', userId: 'u-viewer', emoji: '❤️', likeCount: 9, reactionSummary: {} });
    await flush();

    expect(queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === 'st-1')?.reactionCount).toBe(2);
  });
});

describe('`comment:updated` / `comment:deleted` / `comment:liked` / `comment:unliked` sont ÉCOUTÉS (#7227)', () => {
  test('`comment:updated` remplace la ligne, en direct', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(commentsQueryKey('p-1'), { pages: [{ comments: [{ id: 'c-1', content: 'avant', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' } }] }], pageParams: [undefined] });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.COMMENT_UPDATED, {
      postId: 'p-1',
      comment: { id: 'c-1', content: 'après édition', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' } },
    });
    await flush();

    const rows = (queryClient.getQueryData(commentsQueryKey('p-1')) as { readonly pages: readonly { readonly comments: readonly { readonly id: string; readonly content: string }[] }[] }).pages.flatMap((p) => p.comments);
    expect(rows.find((c) => c.id === 'c-1')?.content).toBe('après édition');
  });

  test('`comment:deleted` retire la ligne ET pose le compte servi sur le Flux', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(commentsQueryKey('p-1'), { pages: [{ comments: [{ id: 'c-1', content: 'x', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' } }] }], pageParams: [undefined] });
    queryClient.setQueryData(FEED_QUERY_KEY, feedWith({ commentCount: 4 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.COMMENT_DELETED, { postId: 'p-1', commentId: 'c-1', commentCount: 3 });
    await flush();

    const rows = (queryClient.getQueryData(commentsQueryKey('p-1')) as { readonly pages: readonly { readonly comments: readonly unknown[] }[] }).pages.flatMap((p) => p.comments);
    expect(rows).toEqual([]);
    expect(queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0]?.commentCount).toBe(3);
  });

  test('`comment:liked` puis `comment:unliked` du LECTEUR posent le compte servi ET mon cœur', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(commentsQueryKey('p-1'), { pages: [{ comments: [{ id: 'c-1', content: 'x', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' }, likeCount: 0, isLikedByMe: false }] }], pageParams: [undefined] });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.COMMENT_LIKED, { postId: 'p-1', commentId: 'c-1', userId: 'u-viewer', emoji: '❤️', likeCount: 1 });
    await flush();
    let rows = (queryClient.getQueryData(commentsQueryKey('p-1')) as { readonly pages: readonly { readonly comments: readonly { readonly id: string; readonly likeCount?: number; readonly isLikedByMe?: boolean }[] }[] }).pages.flatMap((p) => p.comments);
    expect(rows[0]?.likeCount).toBe(1);
    expect(rows[0]?.isLikedByMe).toBe(true);

    socket.fire(SERVER_EVENTS.COMMENT_UNLIKED, { postId: 'p-1', commentId: 'c-1', userId: 'u-viewer', emoji: '❤️', likeCount: 0 });
    await flush();
    rows = (queryClient.getQueryData(commentsQueryKey('p-1')) as { readonly pages: readonly { readonly comments: readonly { readonly id: string; readonly likeCount?: number; readonly isLikedByMe?: boolean }[] }[] }).pages.flatMap((p) => p.comments);
    expect(rows[0]?.likeCount).toBe(0);
    expect(rows[0]?.isLikedByMe).toBe(false);
  });

  test('`destroy` démonte les QUATRE écoutes', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(commentsQueryKey('p-1'), { pages: [{ comments: [{ id: 'c-1', content: 'intact', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' } }] }], pageParams: [undefined] });
    const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    connection.destroy();

    socket.fire(SERVER_EVENTS.COMMENT_UPDATED, { postId: 'p-1', comment: { id: 'c-1', content: 'via un fantôme', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' } } });
    socket.fire(SERVER_EVENTS.COMMENT_DELETED, { postId: 'p-1', commentId: 'c-1', commentCount: 0 });
    await flush();

    const rows = (queryClient.getQueryData(commentsQueryKey('p-1')) as { readonly pages: readonly { readonly comments: readonly { readonly content: string }[] }[] }).pages.flatMap((p) => p.comments);
    expect(rows.map((c) => c.content)).toEqual(['intact']);
  });
});

describe('`post:reaction-added` / `post:reaction-removed` sont ÉCOUTÉS, GARDÉS au ❤️ (#7227)', () => {
  test('❤️ du LECTEUR pose le cœur et le compte servi', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(FEED_QUERY_KEY, feedWith({ isLikedByMe: false, likeCount: 2 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_REACTION_ADDED, {
      postId: 'p-1',
      userId: 'u-viewer',
      emoji: '❤️',
      action: 'add',
      aggregation: { emoji: '❤️', count: 3 },
      timestamp: '2026-09-21T10:00:00.000Z',
    });

    const post = queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0];
    expect(post?.isLikedByMe).toBe(true);
    expect(post?.likeCount).toBe(3);
  });

  test('un emoji NON-❤️ ne change rien — aucun champ ne le porte côté web', () => {
    const { deps, socket, queryClient } = buildDeps();
    const data = feedWith({ isLikedByMe: false, likeCount: 2 });
    queryClient.setQueryData(FEED_QUERY_KEY, data);
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_REACTION_ADDED, {
      postId: 'p-1',
      userId: 'u-other',
      emoji: '👏',
      action: 'add',
      aggregation: { emoji: '👏', count: 1 },
      timestamp: '2026-09-21T10:00:00.000Z',
    });

    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBe(data);
  });

  test('`destroy` démonte les DEUX écoutes', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(FEED_QUERY_KEY, feedWith({ isLikedByMe: false, likeCount: 2 }));
    const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    connection.destroy();

    socket.fire(SERVER_EVENTS.POST_REACTION_REMOVED, {
      postId: 'p-1',
      userId: 'u-viewer',
      emoji: '❤️',
      action: 'remove',
      aggregation: { emoji: '❤️', count: 0 },
      timestamp: '2026-09-21T10:00:00.000Z',
    });

    expect(queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0]?.likeCount).toBe(2);
  });
});
