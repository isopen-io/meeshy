import type { QueryClient } from '@tanstack/react-query';

import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPage, FeedPost } from './feed-pages';
import { postQueryKey } from './publication-detail';

/**
 * LE TEMPS RÉEL DU FLUX (#7182) — `post:created`, `post:updated`,
 * `post:deleted`, les trois événements de publication que web-v2 ne consommait
 * PAS, alors que la passerelle les diffuse aux amis depuis toujours
 * (`SocialEventsHandler.ts:322`) et que `socket.ts` écoutait déjà leurs sept
 * cousins (`post:liked`, `post:bookmarked`, les quatre `story:*`,
 * `comment:added`).
 *
 * Un module d'APPLICATEURS, sur le modèle de `notifications-realtime.ts` : il
 * ne tient aucune requête, seulement les clés et les lois de mise à jour — ce
 * qui le laisse entrer dans le chunk `realtime` sans y tirer un cache de route
 * (D-98).
 *
 * La doctrine est celle d'iOS (`FeedViewModel.swift:1464-1500`), pas une
 * invention locale ; chaque loi ci-dessous cite la ligne qui la porte.
 */

/**
 * LE COMPTE DE CE QU'ON N'A PAS ENCORE VU — miroir de `newPostsCount`
 * (`FeedViewModel.swift:63`), qui alimente la bannière « N nouveaux posts »
 * (`FeedView.swift:1200-1235`).
 *
 * Il vit dans le cache de requêtes plutôt que dans un store à lui : le
 * `QueryClient` est le canal que la socket et les écrans partagent DÉJÀ, et un
 * second canal pour un seul entier coûterait plus que le compte qu'il porte.
 * Aucune `queryFn` ne le sert — c'est un compte de SESSION, sans source
 * serveur : il naît à la première publication reçue et meurt avec l'onglet.
 */
export const FEED_NEW_COUNT_KEY = ['feed', 'new-count'] as const;

const objectOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

/**
 * LA FRONTIÈRE DE TYPE : la charge porte un `Post` du paquet partagé, le cache
 * tient des `FeedPost`. La garde ne vérifie donc QUE ce dont les applicateurs
 * dépendent — un id utilisable. Un id vide passerait les vérifications de type
 * et rendrait la carte indédoublonnable ET irretirable, d'où la longueur.
 */
const postOf = (payload: unknown): FeedPost | null => {
  const post = objectOf(objectOf(payload)?.post);
  if (post === null) return null;
  return typeof post.id === 'string' && post.id.length > 0 ? (post as unknown as FeedPost) : null;
};

const mutationIdOf = (payload: unknown): string | null => {
  const cmid = objectOf(payload)?.clientMutationId;
  return typeof cmid === 'string' && cmid.length > 0 ? cmid : null;
};

export const isPostCreated = (payload: unknown): boolean => postOf(payload) !== null;

export const isPostUpdated = (payload: unknown): boolean => postOf(payload) !== null;

export const isPostDeleted = (payload: unknown): boolean => typeof objectOf(payload)?.postId === 'string';

const mapPages = (
  data: FeedInfiniteData | undefined,
  map: (page: FeedPage) => FeedPage,
): FeedInfiniteData | undefined => (data === undefined ? undefined : { ...data, pages: data.pages.map(map) });

const holds = (data: FeedInfiniteData | undefined, postId: string): boolean =>
  data?.pages.some((page) => page.posts.some((held) => held.id === postId)) === true;

/**
 * CE QUI APPARTIENT AU LECTEUR NE VIENT PAS DU SERVEUR. `isLikedByMe` et
 * `isBookmarkedByMe` se lisent PAR LECTEUR ; un événement diffusé à tous ne
 * peut pas les porter justes pour chacun. Sans cette préservation, un auteur
 * corrigeant une faute de frappe dé-remplirait le cœur de tous ceux qui
 * avaient aimé — miroir explicite d'iOS, « Preserve local-only state (isLiked)
 * across the update » (`FeedViewModel.swift:1495`).
 *
 * Les COMPTEURS, eux, ne sont pas préservés : `likeCount` est un agrégat que le
 * serveur tient, et le sien est plus juste que le nôtre.
 */
const withViewerState = (incoming: FeedPost, held: FeedPost): FeedPost => ({
  ...incoming,
  ...(held.isLikedByMe === undefined || held.isLikedByMe === null ? {} : { isLikedByMe: held.isLikedByMe }),
  ...(held.isBookmarkedByMe === undefined || held.isBookmarkedByMe === null
    ? {}
    : { isBookmarkedByMe: held.isBookmarkedByMe }),
});

const replaceInPages = (data: FeedInfiniteData | undefined, incoming: FeedPost): FeedInfiniteData | undefined =>
  mapPages(data, (page) => ({
    ...page,
    posts: page.posts.map((held) => (held.id === incoming.id ? withViewerState(incoming, held) : held)),
  }));

/**
 * `post:created` — TROIS TEMPS, dans cet ordre (`FeedViewModel.swift:1470`).
 *
 * 1. **réconcilier par cmid** : l'auteur a posé sa publication optimiste sous
 *    le `clientMutationId` comme id (U1 ST3) ; l'écho le rapporte, la carte est
 *    remplacée EN PLACE — sinon l'auteur voit sa publication deux fois. Le
 *    compte ne bouge pas : annoncer « 1 nouveau post » à qui vient de l'écrire
 *    serait un mensonge poli.
 * 2. **ignorer un id déjà tenu** : un rejeu (reconnexion, double abonnement)
 *    dédoublerait la carte ET ferait dériver le compteur — le dépôt a déjà payé
 *    ce défaut sur le cœur (`8893402442`).
 * 3. **insérer en tête et compter** sinon.
 *
 * Un fil ABSENT du cache n'est pas une erreur, et ne se fabrique pas : une page
 * née d'un seul événement afficherait un fil qui n'a jamais été servi.
 */
export function applyPostCreated(queryClient: QueryClient, payload: unknown): void {
  const incoming = postOf(payload);
  if (incoming === null) return;

  const data = queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY);
  if (data === undefined) return;

  const cmid = mutationIdOf(payload);
  if (cmid !== null && holds(data, cmid)) {
    queryClient.setQueryData<FeedInfiniteData>(
      FEED_QUERY_KEY,
      mapPages(data, (page) => ({
        ...page,
        posts: page.posts.map((held) => (held.id === cmid ? withViewerState(incoming, held) : held)),
      })),
    );
    return;
  }

  if (holds(data, incoming.id)) return;

  queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, {
    ...data,
    pages: data.pages.map((page, index) => (index === 0 ? { ...page, posts: [incoming, ...page.posts] } : page)),
  });
  queryClient.setQueryData<number>(FEED_NEW_COUNT_KEY, (held) => (held ?? 0) + 1);
}

/**
 * `post:updated` — REMPLACER, jamais insérer. Une publication hors du fil
 * (hors audience, jamais chargée) ne s'y invite pas par sa modification. Le
 * DÉTAIL suit dans le même mouvement : la même publication ne peut pas porter
 * deux textes selon l'écran qui la montre.
 */
export function applyPostUpdated(queryClient: QueryClient, payload: unknown): void {
  const incoming = postOf(payload);
  if (incoming === null) return;

  queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) => replaceInPages(data, incoming));
  queryClient.setQueryData<FeedPost>(postQueryKey(incoming.id), (held) =>
    held === undefined ? held : withViewerState(incoming, held),
  );
}

/** `post:deleted` — elle quitte le fil ET le détail. */
export function applyPostDeleted(queryClient: QueryClient, payload: unknown): void {
  const postId = objectOf(payload)?.postId;
  if (typeof postId !== 'string') return;

  queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) =>
    mapPages(data, (page) => ({ ...page, posts: page.posts.filter((held) => held.id !== postId) })),
  );
  queryClient.removeQueries({ queryKey: postQueryKey(postId) });
}

/** La bannière tapée : on repart de zéro (`FeedViewModel.swift:389`). */
export function clearNewPostCount(queryClient: QueryClient): void {
  queryClient.setQueryData<number>(FEED_NEW_COUNT_KEY, 0);
}
