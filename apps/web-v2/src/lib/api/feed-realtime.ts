import type { QueryClient } from '@tanstack/react-query';

import { FEED_QUERY_KEY } from './feed';
import { bumpNewPostCount } from './feed-new-count';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { postQueryKey } from './publication-detail';

/**
 * LE TEMPS RÉEL DU FLUX (#7182) — `post:created`, `post:updated`,
 * `post:deleted`, les trois événements de publication que web-v2 ne consommait
 * PAS, alors que la passerelle les diffuse aux amis depuis toujours
 * (`SocialEventsHandler.ts:322`) et que `socket.ts` écoutait déjà leurs sept
 * cousins (`post:liked`, `post:bookmarked`, les quatre `story:*`,
 * `comment:added`).
 *
 * Un module d'APPLICATEURS : il ne tient aucune requête, seulement les lois de
 * mise à jour. `socket.ts` l'atteint par `import()` — MESURÉ, un import
 * statique portait le chunk `realtime` à 5,01 Ko pour un plafond de 5. La CLÉ
 * du compteur vit à part (`feed-new-count.ts`) pour la raison symétrique :
 * l'écran qui l'affiche n'a pas à payer les lois qui l'alimentent.
 *
 * La doctrine est celle d'iOS (`FeedViewModel.swift:1464-1500`), pas une
 * invention locale ; chaque loi ci-dessous cite la ligne qui la porte.
 */


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

/**
 * PAS DE GARDE `is…` EXPORTÉE, contrairement aux six couples de
 * `realtime-apply.ts` — et c'est mesuré, pas une préférence : aucun appelant de
 * production ne s'en servirait (chaque `apply…` garde déjà sa propre charge),
 * et trois exports morts pesaient assez pour porter le chunk `realtime` à 5,01
 * Ko contre un plafond de 5. Les témoins interrogent donc le COMPORTEMENT —
 * une charge malformée ne change rien et ne lève pas — ce qui est de toute
 * façon la règle du dépôt.
 */

/**
 * CE QUI APPARTIENT AU LECTEUR NE VIENT PAS DU SERVEUR. `isLikedByMe` et
 * `isBookmarkedByMe` se lisent PAR LECTEUR ; un événement diffusé à tous ne
 * peut pas les porter justes pour chacun. Sans cette préservation, un auteur
 * corrigeant une faute de frappe dé-remplirait le cœur de tous ceux qui
 * avaient aimé — miroir explicite d'iOS, « Preserve local-only state (isLiked)
 * across the update » (`FeedViewModel.swift:1495`).
 *
 * Un spread CONDITIONNEL, et non `a ?? b` : sous `exactOptionalPropertyTypes`,
 * poser explicitement `undefined` sur une propriété optionnelle est un défaut
 * de type — une propriété ABSENTE et une propriété qui VAUT `undefined` ne sont
 * pas la même chose. La comparaison est `== null` pour couvrir les deux formes
 * d'absence ; un `false` TENU est une réponse du lecteur (« je n'aime pas »),
 * pas une absence, et il survit. Les COMPTEURS ne sont pas préservés —
 * `likeCount` est un agrégat que le serveur tient mieux que nous.
 */
const merged = (incoming: FeedPost, held: FeedPost): FeedPost => ({
  ...incoming,
  ...(held.isLikedByMe == null ? {} : { isLikedByMe: held.isLikedByMe }),
  ...(held.isBookmarkedByMe == null ? {} : { isBookmarkedByMe: held.isBookmarkedByMe }),
});

/** UN SEUL parcours de pages pour les trois lois — insérer, remplacer, retirer
 *  ne diffèrent que par ce qu'elles font d'une liste de cartes. */
const mapPosts = (
  data: FeedInfiniteData | undefined,
  update: (posts: readonly FeedPost[], pageIndex: number) => readonly FeedPost[],
): FeedInfiniteData | undefined =>
  data === undefined
    ? undefined
    : { ...data, pages: data.pages.map((page, index) => ({ ...page, posts: update(page.posts, index) })) };

const idsOf = (data: FeedInfiniteData): readonly string[] => data.pages.flatMap((page) => page.posts.map((p) => p.id));

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

  const ids = idsOf(data);
  if (ids.includes(incoming.id)) return;

  const cmid = mutationIdOf(payload);
  if (cmid !== null && ids.includes(cmid)) {
    queryClient.setQueryData<FeedInfiniteData>(
      FEED_QUERY_KEY,
      mapPosts(data, (posts) => posts.map((held) => (held.id === cmid ? merged(incoming, held) : held))),
    );
    return;
  }

  queryClient.setQueryData<FeedInfiniteData>(
    FEED_QUERY_KEY,
    mapPosts(data, (posts, index) => (index === 0 ? [incoming, ...posts] : posts)),
  );
  bumpNewPostCount(queryClient);
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

  queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) =>
    mapPosts(data, (posts) => posts.map((held) => (held.id === incoming.id ? merged(incoming, held) : held))),
  );
  queryClient.setQueryData<FeedPost>(postQueryKey(incoming.id), (held) =>
    held === undefined ? held : merged(incoming, held),
  );
}

/** `post:deleted` — elle quitte le fil ET le détail. */
export function applyPostDeleted(queryClient: QueryClient, payload: unknown): void {
  const postId = objectOf(payload)?.postId;
  if (typeof postId !== 'string') return;

  queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) =>
    mapPosts(data, (posts) => posts.filter((held) => held.id !== postId)),
  );
  queryClient.removeQueries({ queryKey: postQueryKey(postId) });
}
