import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { postQueryKey } from './publication-detail';
import { reelsQueryKey } from './reels';
import {
  BOOKMARK_FAILED_MESSAGE,
  GESTURE_PENDING_MESSAGE,
  LIKE_FAILED_MESSAGE,
  performPostGesture,
  type PostGestureDeps,
} from './feed-gestures';

const post = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-09-13T11:55:00.000Z',
  ...partial,
});

const seeded = (posts: readonly FeedPost[]): QueryClient => {
  const queryClient = new QueryClient();
  const data: FeedInfiniteData = {
    pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  };
  queryClient.setQueryData(FEED_QUERY_KEY, data);
  return queryClient;
};

const cachedPost = (queryClient: QueryClient, id = 'p1'): FeedPost | undefined =>
  queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts.find((p) => p.id === id);

/** Un transport qui ENREGISTRE ce qu'on lui demande et rend la réponse
 * scriptée — `pending` laisse la réponse en suspens pour observer l'optimiste. */
const scripted = (respond: (req: HttpRequest) => Promise<ApiResult<unknown>>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return respond(req);
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

const gatewayDeps = (queryClient: QueryClient, transport: HttpTransport): PostGestureDeps => ({
  source: 'gateway',
  transport,
  queryClient,
});

describe('performPostGesture — AIMER : optimiste, puis la passerelle', () => {
  test('le cœur et le compte basculent AVANT toute réponse', async () => {
    const queryClient = seeded([post({ isLikedByMe: false, likeCount: 14 })]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const pending = performPostGesture({ postId: 'p1', kind: 'like', deps: gatewayDeps(queryClient, transport) });
    expect(cachedPost(queryClient)?.isLikedByMe).toBe(true);
    expect(cachedPost(queryClient)?.likeCount).toBe(15);

    release({ ok: true, data: { liked: true, reactionSummary: { '❤️': 15 } } });
    expect(await pending).toEqual({ ok: true });
  });

  test('aimer ⇒ `POST /api/v1/posts/:id/like`, avec un `X-Client-Mutation-Id` au format de la passerelle', async () => {
    const queryClient = seeded([post({ isLikedByMe: false, likeCount: 0 })]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: true } }));

    await performPostGesture({ postId: 'p1', kind: 'like', deps: gatewayDeps(queryClient, transport) });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/like');
    expect(requests[0]?.headers?.['X-Client-Mutation-Id']).toMatch(
      /^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test('un post DÉJÀ aimé ⇒ le geste RETIRE : `DELETE …/like`, cœur vide, compte −1', async () => {
    const queryClient = seeded([post({ isLikedByMe: true, likeCount: 3 })]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: false } }));

    const result = await performPostGesture({ postId: 'p1', kind: 'like', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: true });
    expect(requests[0]?.method).toBe('DELETE');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/like');
    expect(cachedPost(queryClient)?.isLikedByMe).toBe(false);
    expect(cachedPost(queryClient)?.likeCount).toBe(2);
  });

  test('404 (publication disparue ou hors audience) ⇒ l’optimiste est DÉFAIT et l’échec annoncé', async () => {
    const queryClient = seeded([post({ isLikedByMe: false, likeCount: 14 })]);
    const { transport } = scripted(async () => ({ ok: false, status: 404, error: 'Post not found', code: 'POST_NOT_FOUND' }));

    const result = await performPostGesture({ postId: 'p1', kind: 'like', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: LIKE_FAILED_MESSAGE });
    expect(cachedPost(queryClient)?.isLikedByMe).toBe(false);
    expect(cachedPost(queryClient)?.likeCount).toBe(14);
  });

  /** 409 : le lecteur a déjà réagi d'un AUTRE emoji depuis une autre surface
   * (`interactions.ts`, garde « une réaction ») — le cache était périmé.
   * Défaire l'optimiste ne suffit pas : il faut aller rechercher la vérité. */
  test('409 ⇒ optimiste défait ET fil invalidé, sans annoncer un échec que le lecteur n’a pas commis', async () => {
    const queryClient = seeded([post({ isLikedByMe: false, likeCount: 5 })]);
    const { transport } = scripted(async () => ({ ok: false, status: 409, error: 'conflict' }));

    const result = await performPostGesture({ postId: 'p1', kind: 'like', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: true });
    expect(cachedPost(queryClient)?.likeCount).toBe(5);
    expect(queryClient.getQueryState(FEED_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  test('panne réseau ⇒ l’optimiste RESTE, et le geste non confirmé est ANNONCÉ', async () => {
    const queryClient = seeded([post({ isLikedByMe: false, likeCount: 1 })]);
    const { transport } = scripted(() => Promise.reject(new TypeError('Failed to fetch')));

    const result = await performPostGesture({ postId: 'p1', kind: 'like', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: true, notice: GESTURE_PENDING_MESSAGE });
    expect(cachedPost(queryClient)?.isLikedByMe).toBe(true);
    expect(cachedPost(queryClient)?.likeCount).toBe(2);
  });

  test('503 ⇒ traité comme une panne passagère : l’optimiste reste, annoncé', async () => {
    const queryClient = seeded([post({ isLikedByMe: false, likeCount: 1 })]);
    const { transport } = scripted(async () => ({ ok: false, status: 503, error: 'unavailable' }));

    expect(await performPostGesture({ postId: 'p1', kind: 'like', deps: gatewayDeps(queryClient, transport) })).toEqual({
      ok: true,
      notice: GESTURE_PENDING_MESSAGE,
    });
    expect(cachedPost(queryClient)?.isLikedByMe).toBe(true);
  });

  /** Miroir `FeedPostCard.swift:974` (`isHeartInFlight`) : un second tap
   * pendant l'appel enverrait un DELETE qui croiserait le POST en route. */
  test('un second geste sur le MÊME post pendant l’appel est ignoré — une seule requête part', async () => {
    const queryClient = seeded([post({ isLikedByMe: false, likeCount: 0 })]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { requests, transport } = scripted(() => new Promise((resolve) => (release = resolve)));
    const deps = gatewayDeps(queryClient, transport);

    const first = performPostGesture({ postId: 'p1', kind: 'like', deps });
    const second = await performPostGesture({ postId: 'p1', kind: 'like', deps });

    expect(second).toEqual({ ok: true });
    expect(requests).toHaveLength(1);
    expect(cachedPost(queryClient)?.likeCount).toBe(1);
    release({ ok: true, data: { liked: true } });
    await first;
  });
});

describe('performPostGesture — ENREGISTRER', () => {
  test('enregistrer ⇒ `POST …/bookmark`, et le compte ABSOLU servi remplace l’estimation optimiste', async () => {
    const queryClient = seeded([post({ isBookmarkedByMe: false, bookmarkCount: 2 })]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { bookmarked: true, bookmarkCount: 9 } }));

    const result = await performPostGesture({ postId: 'p1', kind: 'bookmark', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: true });
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/bookmark');
    expect(cachedPost(queryClient)?.isBookmarkedByMe).toBe(true);
    expect(cachedPost(queryClient)?.bookmarkCount).toBe(9);
  });

  test('retirer des enregistrements ⇒ `DELETE …/bookmark`', async () => {
    const queryClient = seeded([post({ isBookmarkedByMe: true, bookmarkCount: 4 })]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { bookmarked: false, bookmarkCount: 3 } }));

    await performPostGesture({ postId: 'p1', kind: 'bookmark', deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.method).toBe('DELETE');
    expect(cachedPost(queryClient)?.isBookmarkedByMe).toBe(false);
    expect(cachedPost(queryClient)?.bookmarkCount).toBe(3);
  });

  test('404 ⇒ optimiste défait, échec d’enregistrement annoncé', async () => {
    const queryClient = seeded([post({ isBookmarkedByMe: false, bookmarkCount: 2 })]);
    const { transport } = scripted(async () => ({ ok: false, status: 404, error: 'Post not found' }));

    expect(await performPostGesture({ postId: 'p1', kind: 'bookmark', deps: gatewayDeps(queryClient, transport) })).toEqual({
      ok: false,
      message: BOOKMARK_FAILED_MESSAGE,
    });
    expect(cachedPost(queryClient)?.isBookmarkedByMe).toBe(false);
    expect(cachedPost(queryClient)?.bookmarkCount).toBe(2);
  });
});

describe('performPostGesture — source `fixtures`', () => {
  test('le geste bascule sans jamais toucher au transport', async () => {
    const queryClient = seeded([post({ isLikedByMe: false, likeCount: 0 })]);
    const result = await performPostGesture({
      postId: 'p1',
      kind: 'like',
      deps: { source: 'fixtures', transport: {} as HttpTransport, queryClient },
    });
    expect(result).toEqual({ ok: true });
    expect(cachedPost(queryClient)?.isLikedByMe).toBe(true);
  });
});

describe('performPostGesture — le DÉTAIL d’une publication partage le geste (#6278)', () => {
  const detailOf = (queryClient: QueryClient) => queryClient.getQueryData<FeedPost>(postQueryKey('p1'));

  /** Un lien direct vers `/post/:id` n'a JAMAIS rempli le cache du fil :
   * lire l'état depuis le seul fil y verrait « pas aimé » et enverrait un
   * second `POST` sur un post déjà aimé. */
  test('un lien DIRECT (fil vide) lit l’état depuis le cache du détail : un post déjà aimé est RETIRÉ', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(postQueryKey('p1'), post({ isLikedByMe: true, likeCount: 3 }));
    const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: false } }));

    await performPostGesture({ postId: 'p1', kind: 'like', deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.method).toBe('DELETE');
    expect(detailOf(queryClient)?.isLikedByMe).toBe(false);
    expect(detailOf(queryClient)?.likeCount).toBe(2);
  });

  test('le fil ET le détail basculent ensemble — et se défont ensemble sur refus', async () => {
    const queryClient = seeded([post({ isBookmarkedByMe: false, bookmarkCount: 2 })]);
    queryClient.setQueryData(postQueryKey('p1'), post({ isBookmarkedByMe: false, bookmarkCount: 2 }));

    const accepted = scripted(async () => ({ ok: true, data: { bookmarked: true, bookmarkCount: 6 } }));
    await performPostGesture({ postId: 'p1', kind: 'bookmark', deps: gatewayDeps(queryClient, accepted.transport) });
    expect(cachedPost(queryClient)?.isBookmarkedByMe).toBe(true);
    expect(cachedPost(queryClient)?.bookmarkCount).toBe(6);
    expect(detailOf(queryClient)?.isBookmarkedByMe).toBe(true);
    expect(detailOf(queryClient)?.bookmarkCount).toBe(6);

    const refused = scripted(async () => ({ ok: false, status: 404, error: 'Post not found' }));
    await performPostGesture({ postId: 'p1', kind: 'bookmark', deps: gatewayDeps(queryClient, refused.transport) });
    expect(refused.requests[0]?.method).toBe('DELETE');
    expect(detailOf(queryClient)?.isBookmarkedByMe).toBe(true);
    expect(detailOf(queryClient)?.bookmarkCount).toBe(6);
    expect(cachedPost(queryClient)?.bookmarkCount).toBe(6);
  });
});

describe('performPostGesture — le lecteur des RÉELS partage le geste (#6457)', () => {
  const reelsPage = (posts: readonly FeedPost[]): FeedInfiniteData => ({
    pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  const reelIn = (queryClient: QueryClient, seed?: string) =>
    queryClient.getQueryData<FeedInfiniteData>(reelsQueryKey(seed))?.pages[0]?.posts.find((p) => p.id === 'r1');
  const reel = (partial: Partial<FeedPost>): FeedPost => post({ id: 'r1', type: 'REEL', ...partial });

  /** Un réel servi par le fil d'affinité n'est pas forcément dans le Flux :
   * n'y lire que le Flux enverrait « aimer » sur un réel déjà aimé. */
  test('un réel connu du SEUL fil des réels lit son état là : déjà aimé ⇒ `DELETE`, et le fil des réels bascule', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(reelsQueryKey('seed-1'), reelsPage([reel({ isLikedByMe: true, likeCount: 9 })]));
    const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: false } }));

    await performPostGesture({ postId: 'r1', kind: 'like', deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.method).toBe('DELETE');
    expect(reelIn(queryClient, 'seed-1')?.isLikedByMe).toBe(false);
    expect(reelIn(queryClient, 'seed-1')?.likeCount).toBe(8);
  });

  test('le Flux et TOUS les fils de réels basculent ensemble — et se défont ensemble sur refus', async () => {
    const queryClient = seeded([reel({ isBookmarkedByMe: false, bookmarkCount: 1 })]);
    queryClient.setQueryData(reelsQueryKey(), reelsPage([reel({ isBookmarkedByMe: false, bookmarkCount: 1 })]));
    queryClient.setQueryData(reelsQueryKey('seed-2'), reelsPage([reel({ isBookmarkedByMe: false, bookmarkCount: 1 })]));

    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));
    const pending = performPostGesture({ postId: 'r1', kind: 'bookmark', deps: gatewayDeps(queryClient, transport) });

    expect(cachedPost(queryClient, 'r1')?.isBookmarkedByMe).toBe(true);
    expect(reelIn(queryClient)?.isBookmarkedByMe).toBe(true);
    expect(reelIn(queryClient, 'seed-2')?.bookmarkCount).toBe(2);

    release({ ok: false, status: 404, error: 'Post not found' });
    await pending;
    expect(cachedPost(queryClient, 'r1')?.isBookmarkedByMe).toBe(false);
    expect(reelIn(queryClient)?.isBookmarkedByMe).toBe(false);
    expect(reelIn(queryClient, 'seed-2')?.bookmarkCount).toBe(1);
  });

  test('le compte servi fait foi dans les fils de réels aussi', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(reelsQueryKey(), reelsPage([reel({ isBookmarkedByMe: false, bookmarkCount: 1 })]));
    const { transport } = scripted(async () => ({ ok: true, data: { bookmarked: true, bookmarkCount: 12 } }));

    await performPostGesture({ postId: 'r1', kind: 'bookmark', deps: gatewayDeps(queryClient, transport) });

    expect(reelIn(queryClient)?.bookmarkCount).toBe(12);
  });
});
