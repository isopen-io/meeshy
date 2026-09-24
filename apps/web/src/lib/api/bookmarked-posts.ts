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
 * **LE PORT DES PUBLICATIONS ENREGISTRÉES** (#7286) —
 * `GET /api/v1/social/posts?scope=bookmarks`
 * (`services/gateway/src/routes/posts/feed.ts:236` le schéma, `:832` le
 * dispatch, `services/PostFeedService.ts#getBookmarks` la lecture).
 *
 * **LA PASSERELLE ÉTAIT PRÊTE, LE WEB N'AVAIT PAS DE PORTE.** Le geste
 * d'enregistrement écrit depuis #6278, `post:bookmarked` est écouté depuis
 * #7227, et aucune ligne de `apps/web/src` ne lisait `scope=bookmarks` :
 * l'effet du geste était invisible pour toujours à celui qui le faisait.
 *
 * **LE CURSEUR EST OPAQUE**, keyset `createdAt + id` de la ligne `PostBookmark`
 * (`encodeCursor`/`decodeCursor`, `utils/keyset-cursor.ts`) — exactement comme
 * celui de l'auteur (`author-posts.ts`), PAS le décalage ENTIER du hashtag
 * (`hashtag-posts.ts`). Le lire comme un nombre rendrait `cursor=NaN` et une
 * seconde page identique à la première. C'est la seule différence de forme
 * entre ces ports jumeaux, et c'est celle qui casse en silence.
 *
 * **L'ORDRE EST CELUI DE L'ENREGISTREMENT, PAS CELUI DE LA PUBLICATION**
 * (`orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` sur `PostBookmark`) :
 * un vieux post enregistré ce matin passe devant un post d'hier enregistré la
 * semaine dernière. C'est ce qui fonde la place d'une ligne restaurée après un
 * retrait refusé (`bookmark-membership.ts`).
 *
 * **LA SESSION EST EXIGÉE** : `scope=bookmarks` lit la table des favoris du
 * lecteur, `optionalAuth` garde la porte mais la route rend 401 sans session.
 * D'où `bookmarks` dans `PRIVATE_ROUTES` (`session-guard.ts`).
 *
 * **LE SIGNET EST SERVI, JAMAIS DÉDUIT** : `getBookmarks` pose
 * `isBookmarkedByMe: true` sans condition (« la liste EST construite depuis la
 * table des favoris du lecteur », son commentaire). Ce port ne le réécrit pas
 * — un client qui le devinerait s'écarterait de la passerelle au premier
 * changement de forme.
 */

export type BookmarkedPostsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

/** La limite par défaut de la route (`LimiteSchema`, `feed.ts:171`) : 1..50, 20 par défaut. */
export const BOOKMARKS_PAGE_SIZE = 20;

/**
 * LA CLÉ DU CORPUS — une SEULE, sans paramètre : ce corpus est celui du
 * lecteur connecté, il n'a pas de variante. C'est aussi la clé que le geste
 * bascule (`feed-gestures.ts`) et que l'écho temps réel écrit
 * (`feed-realtime.ts`) : deux clés feraient deux vérités sur la même
 * publication.
 */
export const BOOKMARKS_QUERY_KEY = ['bookmarked-posts'] as const;

const RawPagination = (raw: unknown): FeedPagination => {
  const wire = (raw ?? {}) as { readonly limit?: unknown; readonly hasMore?: unknown; readonly nextCursor?: unknown };
  const cursor = typeof wire.nextCursor === 'string' && wire.nextCursor !== '' ? wire.nextCursor : null;
  return {
    limit: typeof wire.limit === 'number' ? wire.limit : BOOKMARKS_PAGE_SIZE,
    hasMore: wire.hasMore === true,
    nextCursor: cursor,
  };
};

export async function loadBookmarkedPostsPage(
  params: BookmarkedPostsDeps & { readonly cursor?: FeedPageParam; readonly signal?: AbortSignal },
): Promise<ApiResult<FeedPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { pageOfBookmarks } = await import('./fixtures-bookmarks');
    return {
      ok: true,
      data: pageOfBookmarks({
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        limit: BOOKMARKS_PAGE_SIZE,
      }),
    };
  }
  const query = new URLSearchParams({ scope: 'bookmarks', limit: String(BOOKMARKS_PAGE_SIZE) });
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

/** Spreadable dans `useInfiniteQuery`, SANS `select` — même motif que
 * `feedInfiniteOptions`. */
export function bookmarkedPostsInfiniteOptions(deps: BookmarkedPostsDeps) {
  return {
    queryKey: BOOKMARKS_QUERY_KEY,
    queryFn: async ({ pageParam, signal }: { readonly pageParam?: FeedPageParam; readonly signal?: AbortSignal }) =>
      unwrap(
        await loadBookmarkedPostsPage({
          ...deps,
          ...(pageParam !== undefined ? { cursor: pageParam } : {}),
          ...(signal !== undefined ? { signal } : {}),
        }),
      ),
    initialPageParam: undefined as FeedPageParam,
    getNextPageParam: nextFeedCursor,
  };
}

/** FABRIQUE — `{ queryKey, queryFn, select }`, l'aplatissement PARTAGÉ avec le
 * Flux : la déduplication par id y a la même raison (un curseur keyset peut
 * chevaucher), et la réécrire ici la ferait diverger. */
export function bookmarkedPostsQuery(deps: BookmarkedPostsDeps) {
  return { ...bookmarkedPostsInfiniteOptions(deps), select: flattenFeedPages };
}
