import { unwrap } from './client';
import type { DataSource } from './config';
import { CANVAS_CAPS_HEADERS, type FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE PORT DU DÉTAIL D'UNE PUBLICATION (#6278) — `GET /api/v1/posts/:postId`
 * (`services/gateway/src/routes/posts/core.ts:476`, requiredAuth). La
 * passerelle applique l'ACL de `getPostById` : « n'existe pas » et « hors
 * audience » rendent le MÊME 404 `POST_NOT_FOUND` (D-6), et le port le
 * remonte tel quel. Le corps servi porte l'état du lecteur sous les mêmes noms
 * que le fil (`isLikedByMe`, `isBookmarkedByMe` — `PostService.ts:872-873`),
 * donc la carte et les gestes du fil s'y appliquent sans traduction.
 *
 * Le fichier s'appelle `publication-detail`, jamais `post-detail` : la règle
 * racine `post-*` (`.gitignore:203`) ignore tout fichier de ce préfixe (D-47).
 */
export type PublicationDeps = { readonly source: DataSource; readonly transport: HttpTransport };

/** Une clé PAR publication, préfixe `posts` — jamais sous `FEED_QUERY_KEY` :
 * invalider le fil ne doit pas relancer chaque détail ouvert, et l'inverse. */
export const postQueryKey = (postId: string) => ['posts', postId] as const;

export async function loadPost(
  params: PublicationDeps & { readonly postId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<FeedPost>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    /* Le corpus des Réels (#6457) est lisible par identifiant, comme la
       passerelle lit toute publication : un lien `/reels?seed=<id>` démarre
       sur son réel même quand le Flux ne l'a jamais servi. */
    const [{ FEED_POSTS }, { REEL_POSTS }] = await Promise.all([import('./fixtures-feed'), import('./fixtures-reels')]);
    const found = [...FEED_POSTS, ...REEL_POSTS].find((post) => post.id === params.postId);
    return found === undefined
      ? { ok: false, status: 404, error: 'Post not found', code: 'POST_NOT_FOUND' }
      : { ok: true, data: found };
  }
  return params.transport.request<FeedPost>({
    method: 'GET',
    path: `/api/v1/posts/${encodeURIComponent(params.postId)}`,
    headers: CANVAS_CAPS_HEADERS,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

export function postQueryOptions(deps: PublicationDeps & { readonly postId: string }) {
  return {
    queryKey: postQueryKey(deps.postId),
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => loadPost({ ...deps, signal }).then(unwrap),
  };
}
