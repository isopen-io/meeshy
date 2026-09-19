import { unwrap } from './client';
import type { DataSource } from './config';
import {
  CANVAS_CAPS_HEADERS,
  flattenFeedPages,
  nextFeedCursor,
  type FeedPage,
  type FeedPageParam,
  type FeedPagination,
  type FeedPost,
} from './feed-pages';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES PUBLICATIONS D'UN AUTEUR** (#7083) —
 * `GET /api/v1/social/posts?scope=author&authorId=<id>`
 * (`services/gateway/src/routes/posts/feed.ts:222-227` le schéma,
 * `:775-778` le dispatch, `services/PostFeedService.ts:866-900` la lecture).
 *
 * **LE CURSEUR EST OPAQUE**, keyset `createdAt + id` (`PostFeedService.ts:916-918`)
 * — PAS le décalage ENTIER du hashtag (`hashtag-posts.ts:15-19`). Le lire comme
 * un nombre rendrait `cursor=NaN` et une seconde page identique à la première.
 * C'est la SEULE différence de forme entre ces deux ports jumeaux, et c'est
 * celle qui casse en silence.
 *
 * **`authorId` EST UN `User.id`, JAMAIS UN PSEUDO** (`PostFeedService.ts:869`) :
 * cette requête DÉPEND donc de la résolution du profil, qui seule connaît
 * l'identifiant. L'écran la garde derrière `enabled`, il ne fabrique pas un
 * identifiant depuis l'adresse.
 *
 * **LA LISTE N'A NI STORY NI STATUT** (`type: { in: [POST, REEL] }`,
 * `PostFeedService.ts:871`) : le compteur de stories du bandeau vient du
 * backend (`expand=stats`), il ne se dérive PAS d'ici — c'est exactement ce que
 * `routes/user-stats.ts:39-45` écrit.
 *
 * **L'AUTH EST OPTIONNELLE** (`feed.ts:737`, `:770-774`) : un visiteur sans
 * compte est servi, avec la visibilité la plus étroite (`PUBLIC` seul,
 * `PostFeedService.ts:881-892`). Une liste plus courte n'est donc pas un défaut
 * de ce port.
 */

export type AuthorPostsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

/** La limite par défaut de la route (`LimiteSchema`, `feed.ts:171`) : 1..50, 20 par défaut. */
export const AUTHOR_POSTS_PAGE_SIZE = 20;

export const authorPostsQueryKey = (authorId: string) => ['author-posts', authorId] as const;

const RawPagination = (raw: unknown): FeedPagination => {
  const wire = (raw ?? {}) as { readonly limit?: unknown; readonly hasMore?: unknown; readonly nextCursor?: unknown };
  const cursor = typeof wire.nextCursor === 'string' && wire.nextCursor !== '' ? wire.nextCursor : null;
  return {
    limit: typeof wire.limit === 'number' ? wire.limit : AUTHOR_POSTS_PAGE_SIZE,
    hasMore: wire.hasMore === true,
    nextCursor: cursor,
  };
};

export async function loadAuthorPosts(
  params: AuthorPostsDeps & { readonly authorId: string; readonly cursor?: string; readonly signal?: AbortSignal },
): Promise<ApiResult<FeedPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureAuthorPosts } = await import('./fixtures-rich-text');
    return { ok: true, data: fixtureAuthorPosts(params.authorId, params.cursor ?? null) };
  }
  const query = new URLSearchParams({
    scope: 'author',
    authorId: params.authorId,
    limit: String(AUTHOR_POSTS_PAGE_SIZE),
  });
  if (params.cursor !== undefined) query.set('cursor', params.cursor);
  const result = await params.transport.request<readonly FeedPost[]>({
    method: 'GET',
    path: `/api/v1/social/posts?${query.toString()}`,
    headers: CANVAS_CAPS_HEADERS,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return { ok: true, data: { posts: result.data, pagination: RawPagination(result.pagination) } };
}

export const AUTHOR_POSTS_STALE_TIME = 60_000;

export function authorPostsInfiniteOptions(deps: AuthorPostsDeps & { readonly authorId: string }) {
  return {
    queryKey: authorPostsQueryKey(deps.authorId),
    staleTime: AUTHOR_POSTS_STALE_TIME,
    initialPageParam: undefined as FeedPageParam,
    queryFn: ({ pageParam, signal }: { readonly pageParam: FeedPageParam; readonly signal: AbortSignal }) =>
      loadAuthorPosts({ ...deps, ...(pageParam === undefined ? {} : { cursor: pageParam }), signal }).then(unwrap),
    /* LA MÊME garde « zéro progrès » que le fil — site UNIQUE, jamais une
       boucle réécrite : `hasMore` faux, curseur absent, curseur STAGNANT, page
       VIDE, aucune ligne neuve (`feed-pages.ts:182-206`). */
    getNextPageParam: nextFeedCursor,
  };
}

/** Ce qu'on APLATIT ne dépend que des PAGES — `flattenFeedPages` reste le site
 * UNIQUE de la déduplication par id. */
export const flattenAuthorPosts = (data: { readonly pages: readonly FeedPage[] } | undefined): readonly FeedPost[] =>
  data === undefined ? [] : flattenFeedPages(data);
