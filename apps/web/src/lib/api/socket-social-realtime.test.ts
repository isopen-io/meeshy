import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { authorPostsQueryKey } from './author-posts';
import { BOOKMARKS_QUERY_KEY } from './bookmarked-posts';
import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { hashtagQueryKey } from './hashtag-posts';
import { commentsQueryKey } from './publication-comments';
import { postQueryKey } from './publication-detail';
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

/**
 * **L'APPLICATION DE `story:*` / `comment:*` ARRIVE PAR `import()` (D-98)** :
 * elle se résout en micro-tâches, jamais dans le tour du `fire`. Un BUDGET de
 * tours fixe est une constante ; la résolution d'un module est un TRAVAIL
 * dont la durée dépend de la contention — mesuré #6187 : un témoin qui
 * n'attend qu'un tour rougit en CI (charge) et verdit en local (repos). On
 * BORNE en TEMPS et on relit la condition à chaque tour, jamais l'inverse.
 */
const FLUSH_TIMEOUT_MS = 2000;
const flush = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + FLUSH_TIMEOUT_MS;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (condition() || Date.now() >= deadline) return;
  }
};

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

  /**
   * **LA FICHE `/post/$post` EST UNE CAISSE COMME LES AUTRES** (revue-correction
   * W8, #7227) — le geste LOCAL l'écrit depuis toujours
   * (`feed-gestures.ts:127,142`) et la jumelle `post:reaction-*` de ce lot
   * l'écrit aussi (`feed-realtime.ts#applyPostReactionEvent`) ; `post:liked` /
   * `post:unliked` — la voie NOMINALE du ❤️ sur un POST/REEL
   * (`PostReactionHandler.ts:106-123`, qui ne ré-émet PAS `post:reaction-*`
   * pour le cœur) — la sautait. Une fiche ouverte gardait donc l'ancien
   * chiffre pendant que le Flux et les Réels bougeaient dans son dos.
   */
  test("`post:liked` d\u2019un AUTRE pose le compte servi sur la FICHE ouverte", () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData<FeedPost>(postQueryKey('p-1'), { id: 'p-1', type: 'POST', createdAt: '2026-09-21T10:00:00.000Z', likeCount: 3, isLikedByMe: false });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_LIKED, { postId: 'p-1', userId: 'u-other', emoji: '\u2764\ufe0f', likeCount: 7, reactionSummary: {} });

    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p-1'))?.likeCount).toBe(7);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p-1'))?.isLikedByMe).toBe(false);
  });

  test("`post:unliked` DU LECTEUR vide le c\u0153ur de la FICHE", () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData<FeedPost>(postQueryKey('p-1'), { id: 'p-1', type: 'POST', createdAt: '2026-09-21T10:00:00.000Z', likeCount: 4, isLikedByMe: true });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_UNLIKED, { postId: 'p-1', userId: 'u-viewer', emoji: '\u2764\ufe0f', likeCount: 3, reactionSummary: {} });

    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p-1'))?.isLikedByMe).toBe(false);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p-1'))?.likeCount).toBe(3);
  });

  /**
   * **LA QUATRIÈME CAISSE** (#7286) — le corpus des ENREGISTRÉES. Un retrait
   * venu d'un AUTRE appareil doit ÔTER la ligne de l'écran ouvert : la
   * basculer y laisserait une publication qui n'est plus enregistrée dans la
   * liste des publications enregistrées.
   */
  test('un RETRAIT venu d’ailleurs ôte la ligne du corpus des enregistrées', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(BOOKMARKS_QUERY_KEY, feedWith({ isBookmarkedByMe: true, bookmarkCount: 4 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_BOOKMARKED, { postId: 'p-1', bookmarked: false, bookmarkCount: 3 });

    expect(queryClient.getQueryData<FeedInfiniteData>(BOOKMARKS_QUERY_KEY)?.pages[0]?.posts).toEqual([]);
  });

  /**
   * ENREGISTRER venu d'ailleurs : la PLACE de la ligne dépend de
   * `PostBookmark.createdAt`, que la charge ne porte pas — le corpus est
   * rendu PÉRIMÉ, jamais deviné. Sans ce témoin, un enregistrement fait sur
   * un autre appareil n'apparaissait sur l'écran qu'à la prochaine
   * péremption naturelle.
   */
  test('un ENREGISTREMENT venu d’ailleurs rend le corpus des enregistrées périmé', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(BOOKMARKS_QUERY_KEY, feedWith({ id: 'p-0', isBookmarkedByMe: true }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_BOOKMARKED, { postId: 'p-1', bookmarked: true, bookmarkCount: 1 });

    expect(queryClient.getQueryState(BOOKMARKS_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  /**
   * L'écran des enregistrées peint ses cartes depuis SA caisse : un cœur posé
   * depuis un autre appareil — ou par un autre lecteur — doit y arriver comme
   * il arrive au Flux, aux Réels et à la fiche.
   */
  test('`post:liked` atteint AUSSI la carte de l’écran des enregistrées', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(BOOKMARKS_QUERY_KEY, feedWith({ isBookmarkedByMe: true, isLikedByMe: false, likeCount: 3 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_LIKED, { postId: 'p-1', userId: 'u-viewer', emoji: '❤️', likeCount: 4, reactionSummary: {} });

    const line = queryClient.getQueryData<FeedInfiniteData>(BOOKMARKS_QUERY_KEY)?.pages[0]?.posts[0];
    expect(line?.isLikedByMe).toBe(true);
    expect(line?.likeCount).toBe(4);
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
    const storyOf = () => queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === 'st-1');
    await flush(() => storyOf()?.reactionCount === 3);

    expect(storyOf()?.reactionCount).toBe(3);
    expect(storyOf()?.currentUserReactions).toEqual(['❤️']);
  });

  test('`story:unreacted` pose le compte servi', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story({ currentUserReactions: ['❤️'], reactionCount: 3 })]);
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.STORY_UNREACTED, { storyId: 'st-1', userId: 'u-other', emoji: '❤️', likeCount: 2, reactionSummary: {} });
    const storyOf = () => queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === 'st-1');
    await flush(() => storyOf()?.reactionCount === 2);

    expect(storyOf()?.reactionCount).toBe(2);
    /* SA réaction à LUI n'est pas la mienne — mon cœur ne bouge pas. */
    expect(storyOf()?.currentUserReactions).toEqual(['❤️']);
  });

  /**
   * `destroy` retire l'écouteur AVANT le `fire` : aucun `import()` n'est
   * donc jamais déclenché — pas de course à attendre, une courte attente
   * fixe suffit à prouver l'ABSENCE.
   */
  test('`destroy` démonte les DEUX écoutes', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story()]);
    const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    connection.destroy();

    socket.fire(SERVER_EVENTS.STORY_REACTED, { storyId: 'st-1', userId: 'u-viewer', emoji: '❤️', likeCount: 9, reactionSummary: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === 'st-1')?.reactionCount).toBe(2);
  });
});

describe('`story:viewed` est ÉCOUTÉ pour le compte des vues (#7116, revue)', () => {
  test('`story:viewed` pose le compte SERVI sur MA story — « Vues » suit sans recharger', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story({ viewCount: 8 })]);
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.STORY_VIEWED, { storyId: 'st-1', viewerId: 'u-noor', viewerUsername: 'noor', viewCount: 9 });
    const storyOf = () => queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === 'st-1');
    await flush(() => storyOf()?.viewCount === 9);

    expect(storyOf()?.viewCount).toBe(9);
  });

  test('`destroy` démonte l’écoute', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story({ viewCount: 8 })]);
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps).destroy();

    socket.fire(SERVER_EVENTS.STORY_VIEWED, { storyId: 'st-1', viewerId: 'u-noor', viewerUsername: 'noor', viewCount: 9 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === 'st-1')?.viewCount).toBe(8);
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
    const rowsOf = () => (queryClient.getQueryData(commentsQueryKey('p-1')) as { readonly pages: readonly { readonly comments: readonly { readonly id: string; readonly content: string }[] }[] }).pages.flatMap((p) => p.comments);
    await flush(() => rowsOf().find((c) => c.id === 'c-1')?.content === 'après édition');

    expect(rowsOf().find((c) => c.id === 'c-1')?.content).toBe('après édition');
  });

  test('`comment:deleted` retire la ligne ET pose le compte servi sur le Flux', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(commentsQueryKey('p-1'), { pages: [{ comments: [{ id: 'c-1', content: 'x', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' } }] }], pageParams: [undefined] });
    queryClient.setQueryData(FEED_QUERY_KEY, feedWith({ commentCount: 4 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.COMMENT_DELETED, { postId: 'p-1', commentId: 'c-1', commentCount: 3 });
    const rowsOf = () => (queryClient.getQueryData(commentsQueryKey('p-1')) as { readonly pages: readonly { readonly comments: readonly unknown[] }[] }).pages.flatMap((p) => p.comments);
    await flush(() => rowsOf().length === 0);

    expect(rowsOf()).toEqual([]);
    expect(queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0]?.commentCount).toBe(3);
  });

  test('`comment:liked` puis `comment:unliked` du LECTEUR posent le compte servi ET mon cœur', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(commentsQueryKey('p-1'), { pages: [{ comments: [{ id: 'c-1', content: 'x', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' }, likeCount: 0, isLikedByMe: false }] }], pageParams: [undefined] });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    type LikeRow = { readonly id: string; readonly likeCount?: number; readonly isLikedByMe?: boolean };
    const rowsOf = () =>
      (queryClient.getQueryData(commentsQueryKey('p-1')) as { readonly pages: readonly { readonly comments: readonly LikeRow[] }[] }).pages.flatMap((p) => p.comments);

    socket.fire(SERVER_EVENTS.COMMENT_LIKED, { postId: 'p-1', commentId: 'c-1', userId: 'u-viewer', emoji: '❤️', likeCount: 1 });
    await flush(() => rowsOf()[0]?.likeCount === 1);
    expect(rowsOf()[0]?.likeCount).toBe(1);
    expect(rowsOf()[0]?.isLikedByMe).toBe(true);

    socket.fire(SERVER_EVENTS.COMMENT_UNLIKED, { postId: 'p-1', commentId: 'c-1', userId: 'u-viewer', emoji: '❤️', likeCount: 0 });
    await flush(() => rowsOf()[0]?.likeCount === 0);
    expect(rowsOf()[0]?.likeCount).toBe(0);
    expect(rowsOf()[0]?.isLikedByMe).toBe(false);
  });

  /** `destroy` retire les écoutes AVANT le `fire` : aucun `import()` n'est
   * jamais déclenché — une courte attente fixe suffit à prouver l'ABSENCE. */
  test('`destroy` démonte les QUATRE écoutes', async () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(commentsQueryKey('p-1'), { pages: [{ comments: [{ id: 'c-1', content: 'intact', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' } }] }], pageParams: [undefined] });
    const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    connection.destroy();

    socket.fire(SERVER_EVENTS.COMMENT_UPDATED, { postId: 'p-1', comment: { id: 'c-1', content: 'via un fantôme', createdAt: '2026-09-21T09:00:00.000Z', author: { id: 'u-a', displayName: 'A', username: 'a' } } });
    socket.fire(SERVER_EVENTS.COMMENT_DELETED, { postId: 'p-1', commentId: 'c-1', commentCount: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

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

/**
 * **`post:bookmarked` — LA TROISIÈME LOI QUE LES RÉELS APPRENNENT**
 * (revue-correction W8, #7227). Le périmètre iOS que ce lot reproduit cite
 * QUATRE événements pour le pager de Réels — `postLiked`, `postUnliked`,
 * **`postBookmarked`**, `postDeleted` (`ReelsViewModel.swift:95-183`,
 * `subscribeToBookmarkEvents` → `applyServerBookmark`) — et le web n'en avait
 * câblé que trois : l'écho du favori n'écrivait QUE `FEED_QUERY_KEY`.
 *
 * Le geste LOCAL, lui, tient les trois caisses depuis #6457
 * (`feed-gestures.ts#performPostGesture`, `setOn`). La divergence se voit
 * donc là où il n'y a PAS de geste local : un favori posé depuis un AUTRE
 * appareil (ou depuis le Flux, sur une carte que les Réels tiennent aussi)
 * n'atteignait ni le pager ni la fiche — et le `bookmarkCount` ABSOLU que
 * l'écho porte n'y arrivait jamais.
 */
describe('`post:bookmarked` écrit AUSSI les RÉELS et la FICHE (#7227)', () => {
  test('un favori posé ailleurs remplit le signet du pager de Réels, avec son compte servi', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(reelsQueryKey('seed-r'), feedWith({ isBookmarkedByMe: false, bookmarkCount: 2 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_BOOKMARKED, { postId: 'p-1', bookmarked: true, bookmarkCount: 3 });

    const reel = queryClient.getQueryData<FeedInfiniteData>(reelsQueryKey('seed-r'))?.pages[0]?.posts[0];
    expect(reel?.isBookmarkedByMe).toBe(true);
    expect(reel?.bookmarkCount).toBe(3);
  });

  test('la FICHE ouverte apprend le retrait du favori', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData<FeedPost>(postQueryKey('p-1'), {
      id: 'p-1',
      type: 'POST',
      createdAt: '2026-09-21T10:00:00.000Z',
      isBookmarkedByMe: true,
      bookmarkCount: 4,
    });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_BOOKMARKED, { postId: 'p-1', bookmarked: false, bookmarkCount: 3 });

    const fiche = queryClient.getQueryData<FeedPost>(postQueryKey('p-1'));
    expect(fiche?.isBookmarkedByMe).toBe(false);
    expect(fiche?.bookmarkCount).toBe(3);
  });

  test('le FLUX bouge toujours, exactement comme avant ce lot', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(FEED_QUERY_KEY, feedWith({ isBookmarkedByMe: false, bookmarkCount: 1 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_BOOKMARKED, { postId: 'p-1', bookmarked: true, bookmarkCount: 2 });

    const post = queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0];
    expect(post?.isBookmarkedByMe).toBe(true);
    expect(post?.bookmarkCount).toBe(2);
  });

  /* Un écho SANS `bookmarkCount` (passerelle plus ancienne) bascule le signet
     et DÉCALE le compte d'un cran — la loi d'avant ce lot, inchangée : c'est
     `togglePost` qui la tient, et elle est IDEMPOTENTE (un second écho sur un
     signet déjà posé rend la MÊME carte, donc le compte ne dérive pas). */
  test('un écho SANS compte servi bascule le signet, une seule fois', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(reelsQueryKey(), feedWith({ isBookmarkedByMe: false, bookmarkCount: 5 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_BOOKMARKED, { postId: 'p-1', bookmarked: true });
    socket.fire(SERVER_EVENTS.POST_BOOKMARKED, { postId: 'p-1', bookmarked: true });

    const reel = queryClient.getQueryData<FeedInfiniteData>(reelsQueryKey())?.pages[0]?.posts[0];
    expect(reel?.isBookmarkedByMe).toBe(true);
    expect(reel?.bookmarkCount).toBe(6);
  });
});

/**
 * **UN ÉCHO VENU D'AILLEURS ATTEINT LA PAGE D'UN HASHTAG ET LE PROFIL**
 * (#7341). Ces deux écrans peignent leurs cartes depuis LEUR caisse
 * (`hashtagQueryKey`, `authorPostsQueryKey`) ; les échos n'écrivaient que le
 * Flux, les Réels, la fiche et les enregistrées. Un cœur posé depuis un autre
 * appareil — ou par un autre lecteur — n'y arrivait donc jamais, et le
 * compteur restait au chiffre de l'ouverture. Miroir de
 * `ProfileUserPostsList.swift` (`subscribeToSocketUpdates`), qui écoute
 * `postLiked`, `postUnliked` et `postBookmarked` sur les publications d'un
 * profil.
 */
describe('`post:liked` / `post:bookmarked` atteignent un HASHTAG et un PROFIL (#7341)', () => {
  const hashtagPage = (partial: Partial<FeedPost>) => ({
    pages: [{ posts: [{ id: 'p-1', type: 'POST', createdAt: '2026-09-21T10:00:00.000Z', ...partial }], nextCursor: null }],
    pageParams: [0],
  });
  const cardOf = (queryClient: QueryClient, key: readonly unknown[]): FeedPost | undefined =>
    queryClient.getQueryData<{ readonly pages: readonly { readonly posts: readonly FeedPost[] }[] }>(key)?.pages[0]?.posts[0];

  test('mon cœur posé sur un AUTRE appareil remplit la carte du hashtag, avec le compte servi', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(hashtagQueryKey('voyage'), hashtagPage({ isLikedByMe: false, likeCount: 3 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_LIKED, { postId: 'p-1', userId: 'u-viewer', emoji: '❤️', likeCount: 4, reactionSummary: {} });

    expect(cardOf(queryClient, hashtagQueryKey('voyage'))?.isLikedByMe).toBe(true);
    expect(cardOf(queryClient, hashtagQueryKey('voyage'))?.likeCount).toBe(4);
  });

  test('le cœur retiré par un AUTRE lecteur pose le compte servi sur le profil, sans toucher MON cœur', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(authorPostsQueryKey('u-auteur'), feedWith({ isLikedByMe: true, likeCount: 5 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_UNLIKED, { postId: 'p-1', userId: 'u-autre', emoji: '❤️', likeCount: 4, reactionSummary: {} });

    expect(cardOf(queryClient, authorPostsQueryKey('u-auteur'))?.isLikedByMe).toBe(true);
    expect(cardOf(queryClient, authorPostsQueryKey('u-auteur'))?.likeCount).toBe(4);
  });

  test('un enregistrement fait ailleurs pose le signet sur le hashtag ET sur le profil, avec son compte servi', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(hashtagQueryKey('voyage'), hashtagPage({ isBookmarkedByMe: false, bookmarkCount: 1 }));
    queryClient.setQueryData(authorPostsQueryKey('u-auteur'), feedWith({ isBookmarkedByMe: false, bookmarkCount: 1 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_BOOKMARKED, { postId: 'p-1', bookmarked: true, bookmarkCount: 2 });

    for (const key of [hashtagQueryKey('voyage'), authorPostsQueryKey('u-auteur')]) {
      expect(cardOf(queryClient, key)?.isBookmarkedByMe).toBe(true);
      expect(cardOf(queryClient, key)?.bookmarkCount).toBe(2);
    }
  });

  test('`post:reaction-added` ❤️ d’un autre lecteur pose le compte servi sur le profil', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(authorPostsQueryKey('u-auteur'), feedWith({ isLikedByMe: false, likeCount: 1 }));
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.POST_REACTION_ADDED, {
      postId: 'p-1',
      userId: 'u-autre',
      emoji: '❤️',
      action: 'add',
      aggregation: { emoji: '❤️', count: 2, userIds: [], hasCurrentUser: false },
      timestamp: '2026-09-21T10:01:00.000Z',
    });

    expect(cardOf(queryClient, authorPostsQueryKey('u-auteur'))?.isLikedByMe).toBe(false);
    expect(cardOf(queryClient, authorPostsQueryKey('u-auteur'))?.likeCount).toBe(2);
  });
});
