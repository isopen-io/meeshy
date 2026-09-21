import type { QueryClient } from '@tanstack/react-query';

import { togglePost, withServedCount } from '@/lib/feed/interactions';

import { FEED_QUERY_KEY } from './feed';
import { bumpNewPostCount } from './feed-new-count';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { postQueryKey } from './publication-detail';
/* `./reels-query-key`, jamais `./reels` — ce module est atteint par `socket.ts`
 * (le chunk `realtime`, chargé en `import()` APRÈS la première peinture) EN
 * PLUS de la route `/reels` (chemin synchrone) ; importer le port ENTIER des
 * réels depuis ce second chemin en fait un module partagé entre deux chunks
 * async, que Rollup extrait sous un nom qui COLLISIONNE avec le chunk de la
 * route (`budgets.json › on_demand_chunks.reels`, qui SOMME tout fichier du
 * motif) — voir le doc-comment de `reels-query-key.ts`. */
import { REELS_QUERY_ROOT } from './reels-query-key';

/**
 * LE TEMPS RÉEL DU FLUX (#7182) — `post:created`, `post:updated`,
 * `post:deleted`, les trois événements de publication que web-v2 ne consommait
 * PAS, alors que la passerelle les diffuse aux amis depuis toujours
 * (`SocialEventsHandler.ts:322`) et que `socket.ts` écoutait déjà leurs sept
 * cousins (`post:liked`, `post:bookmarked`, les quatre `story:*`,
 * `comment:added`).
 *
 * Un module d'APPLICATEURS : il ne tient aucune requête, seulement les lois de
 * mise à jour. `socket.ts` l'atteint par un import STATIQUE, et c'est MESURÉ :
 * ce module ne tirant aucune requête, le rendre différé coûtait PLUS que
 * lui-même (5,10 Ko contre 5,01 pour le chunk `realtime`, plafond 5 — trois
 * `import()` et leur table de dépendances). La CLÉ du compteur vit à part
 * (`feed-new-count.ts`) pour la raison symétrique : l'écran qui l'affiche n'a
 * pas à payer les lois qui l'alimentent.
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

/**
 * `post:deleted` — elle quitte le fil, le détail, ET LES RÉELS (#7227, W8).
 *
 * Exactement le périmètre qu'iOS observe (`ReelsViewModel.swift:169-183`,
 * `postDeleted` SEUL parmi les événements de publication — ni `postCreated`
 * ni `postUpdated` n'y sont câblés) : le fil des Réels est un fil
 * D'AFFINITÉ résolu par le serveur, y insérer une carte créée côté client
 * inventerait un tri que le serveur n'a pas décidé. La suppression, elle, ne
 * trie rien — elle retire une carte que TOUT client doit cesser de montrer.
 *
 * `setQueriesData` avec la RACINE (`REELS_QUERY_ROOT`) atteint toutes les
 * graines en cache à la fois (TanStack compare les clés par préfixe).
 */
export function applyPostDeleted(queryClient: QueryClient, payload: unknown): void {
  const postId = objectOf(payload)?.postId;
  if (typeof postId !== 'string') return;

  const removeFromPages = (data: FeedInfiniteData | undefined) =>
    mapPosts(data, (posts) => posts.filter((held) => held.id !== postId));

  queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, removeFromPages);
  queryClient.setQueriesData<FeedInfiniteData>({ queryKey: REELS_QUERY_ROOT }, removeFromPages);
  queryClient.removeQueries({ queryKey: postQueryKey(postId) });
}

/**
 * `post:reaction-added` / `post:reaction-removed` (#7227, W8) — GARDÉS au
 * seul ❤️, miroir EXACT d'iOS (`FeedView.swift:1307-1325`). Le ❤️ posé sur un
 * POST/REEL part en pratique par `post:liked`/`post:unliked`
 * (`PostReactionHandler.ts:106-123`, `broadcastReactionChange`) — ce chemin
 * est donc une PROTECTION contre un rejeu par cette voie plutôt que le
 * chemin nominal. Les emojis NON-❤️ n'ont AUCUN champ côté `FeedPost` :
 * `reactionSummary`/`currentUserReactions` n'existent que sur
 * `StoryFeedPost`/`PostComment` (`stories.ts`, `publication-comments.ts`) —
 * leur donner un effet ici inventerait un champ que rien ne sert.
 *
 * Même garde que `post:liked` (`socket.ts#onPostLikeChanged`) : le compte
 * ABSOLU (`aggregation.count`) remplace l'estimation, et `isLikedByMe` ne
 * bascule que pour le geste du LECTEUR (un autre de ses appareils).
 */
const HEART_EMOJI = '❤️';

function isPostReactionEvent(payload: unknown): payload is {
  readonly postId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly aggregation: { readonly count: number };
} {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.postId !== 'string' || typeof p.userId !== 'string' || typeof p.emoji !== 'string') return false;
  if (p.action !== 'add' && p.action !== 'remove') return false;
  const aggregation = p.aggregation;
  if (typeof aggregation !== 'object' || aggregation === null) return false;
  const count = (aggregation as Record<string, unknown>).count;
  return typeof count === 'number' && Number.isFinite(count);
}

/**
 * **LE ❤️ SERVI SE POSE AUX TROIS CAISSES, UNE SEULE FOIS** (revue-correction
 * W8, #7227) — le Flux, TOUTES les graines de Réels, et la FICHE
 * `/post/$post`. Site UNIQUE, partagé par les DEUX voies que la passerelle
 * emprunte pour un cœur : `post:liked`/`post:unliked`
 * (`socket.ts#onPostLikeChanged`, la voie NOMINALE d'un POST/REEL) et
 * `post:reaction-added`/`post:reaction-removed` (ci-dessous).
 *
 * La fiche était la caisse manquante : le geste LOCAL l'écrit
 * (`feed-gestures.ts:127,142`), la jumelle `post:reaction-*` l'écrivait, et
 * la voie nominale la sautait — une fiche ouverte gardait l'ancien chiffre
 * pendant que le Flux bougeait dans son dos. Deux boucles recopiées avaient
 * commencé à diverger ; il n'y en a plus qu'une.
 *
 * `isLikedByMe` ne bascule que pour le geste du LECTEUR (un autre de SES
 * appareils) — le cœur d'un autre ne remplit jamais le mien ; le compte, lui,
 * est ABSOLU et remplace toujours l'estimation optimiste.
 */
/**
 * **LES TROIS CAISSES D'UNE CARTE, ÉNUMÉRÉES UNE SEULE FOIS** — le Flux,
 * TOUTES les graines de Réels, la fiche `/post/$post`. Chaque loi servie
 * (`post:liked`, `post:bookmarked`, `post:reaction-*`) dit ce qu'elle fait
 * D'UNE carte ; d'où elle le fait se lit ici, et nulle part ailleurs. C'est
 * la recopie de cette boucle qui a fait diverger les caisses deux fois.
 */
function applyToPostCaches(queryClient: QueryClient, postId: string, applyToPost: (post: FeedPost) => FeedPost): void {
  const applyToPages = (data: FeedInfiniteData | undefined) => mapPosts(data, (posts) => posts.map(applyToPost));
  queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, applyToPages);
  queryClient.setQueriesData<FeedInfiniteData>({ queryKey: REELS_QUERY_ROOT }, applyToPages);
  queryClient.setQueryData<FeedPost>(postQueryKey(postId), (post) => (post === undefined ? post : applyToPost(post)));
}

export function applyServedLike(
  queryClient: QueryClient,
  change: { readonly postId: string; readonly on: boolean; readonly byViewer: boolean; readonly likeCount: number },
): void {
  const { postId } = change;
  const toggle = { postId, kind: 'like' as const, on: change.on };
  const served = { postId, kind: 'like' as const, count: change.likeCount };

  applyToPostCaches(queryClient, postId, (post) =>
    post.id !== postId ? post : withServedCount(change.byViewer ? togglePost(post, toggle) : post, served),
  );
}

/**
 * **LE FAVORI SERVI SE POSE AUX MÊMES TROIS CAISSES** (revue-correction W8,
 * #7227) — `post:bookmarked` n'écrivait QUE le Flux, pendant que le geste
 * LOCAL tient les trois depuis #6457 (`feed-gestures.ts#performPostGesture`,
 * `setOn`) et qu'iOS réconcilie aussi son pager de Réels
 * (`ReelsViewModel.swift:139-163`, `applyServerBookmark`). La divergence se
 * voyait là où aucun geste local ne l'avait masquée : un favori posé depuis
 * un AUTRE appareil n'atteignait ni le pager ni la fiche.
 *
 * **PAS DE GARDE `byViewer` ICI, ET C'EST MESURÉ** : le favori est PERSONNEL
 * — la passerelle n'émet l'événement que vers la feed room de son auteur
 * (`emitToUser`, doc-comment de `subscribeToBookmarkEvents`) —, donc tout
 * écho reçu est le nôtre. `bookmarkCount` est OPTIONNEL sur le fil : absent,
 * on bascule le signet sans inventer de chiffre.
 */
export function applyServedBookmark(
  queryClient: QueryClient,
  change: { readonly postId: string; readonly on: boolean; readonly bookmarkCount?: number | undefined },
): void {
  const { postId, bookmarkCount } = change;
  const toggle = { postId, kind: 'bookmark' as const, on: change.on };

  applyToPostCaches(queryClient, postId, (post) => {
    if (post.id !== postId) return post;
    const toggled = togglePost(post, toggle);
    return bookmarkCount === undefined ? toggled : withServedCount(toggled, { postId, kind: 'bookmark', count: bookmarkCount });
  });
}

export function applyPostReactionEvent(queryClient: QueryClient, payload: unknown, viewerId: string): void {
  if (!isPostReactionEvent(payload)) return;
  if (payload.emoji !== HEART_EMOJI) return;

  applyServedLike(queryClient, {
    postId: payload.postId,
    on: payload.action === 'add',
    byViewer: payload.userId === viewerId,
    likeCount: payload.aggregation.count,
  });
}
