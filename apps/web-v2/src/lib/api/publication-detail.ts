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

/**
 * **CINQ MINUTES DE FRAÎCHEUR** (#6974) — une publication est un objet PUBLIÉ :
 * son texte, ses médias et son auteur ne changent plus. Ce qui bouge — les
 * compteurs et l'état du lecteur — est déjà tenu SANS relecture : le
 * registre des caisses de cartes (`card-caches.ts`, #7341) écrit cette
 * clé-là avec toutes les autres pour aimer, enregistrer, commenter, partager
 * et le compte servi, et l'invalide quand la passerelle refuse
 * (`invalidateCardPost`). Le défaut de l'application (30 s,
 * `query-client.ts:234`) relisait donc la publication entière à chaque retour
 * de focus.
 *
 * **Ce que la fenêtre coûte** : depuis #7227, `post:liked`, `:unliked` et
 * `:bookmarked` écrivent cette clé aussi (`feed-realtime.ts`, par le
 * registre) ; seule une modification que la passerelle ne DIFFUSE pas peut
 * attendre la fenêtre.
 *
 * **La fenêtre est neutralisée dans `usePost`, et c'est assumé** :
 * `query.ts:206` repose `staleTime: 0` APRÈS avoir répandu cette fabrique —
 * cache-first par `initialData` (la carte déjà reçue par le fil, datée du
 * fil), revalidation en fond, justifié par son propre doc-comment et hors
 * périmètre de #6974. La valeur ci-dessous gouverne donc la GRAINE des Réels
 * (`routes/reels.tsx:167`, qui ne repose rien), et tout consommateur à venir.
 */
export const PUBLICATION_STALE_TIME = 5 * 60_000;

export function postQueryOptions(deps: PublicationDeps & { readonly postId: string }) {
  return {
    queryKey: postQueryKey(deps.postId),
    staleTime: PUBLICATION_STALE_TIME,
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => loadPost({ ...deps, signal }).then(unwrap),
  };
}
