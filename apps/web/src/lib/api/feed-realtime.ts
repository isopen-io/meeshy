import type { QueryClient } from '@tanstack/react-query';

import { withoutBookmark } from '@/lib/feed/bookmark-membership';
import { togglePost, withServedCount } from '@/lib/feed/interactions';

import { BOOKMARKS_QUERY_KEY } from './bookmarked-posts';
import { mergeServedPost, removeCardPost, replaceCardContent, updateCardPost, writeCardCache } from './card-caches';
import { FEED_QUERY_KEY } from './feed';
import { bumpNewPostCount } from './feed-new-count';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { mergedTranslations, nonEmpty, translationDeliveryOf, type TranslationDelivery } from './translation-delivery';

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

/** Le parcours des pages du FLUX SEUL, pour `post:created` : insérer en tête
 *  et réconcilier par cmid n'ont de sens que là. Tout ce qui change une carte
 *  sur CHAQUE écran qui la montre passe par le registre (`card-caches.ts`). */
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
      mapPosts(data, (posts) => posts.map((held) => (held.id === cmid ? mergeServedPost(incoming, held) : held))),
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
 * `post:updated` — REMPLACER, jamais insérer. Une publication hors d'un écran
 * (hors audience, jamais chargée) ne s'y invite pas par sa modification.
 * Chaque écran qui la MONTRE suit dans le même mouvement (`replaceCardContent`,
 * le registre des caisses de cartes) : le Flux, la fiche, les enregistrées, la
 * page d'un hashtag, le profil de son auteur (#7341, miroir de
 * `ProfileUserPostsList.swift`, qui écoute `postUpdated`) — la même
 * publication ne peut pas porter deux textes selon l'écran qui la montre.
 * Jamais le fil GELÉ des Réels, qu'iOS ne câble pas sur `postUpdated`.
 */
export function applyPostUpdated(queryClient: QueryClient, payload: unknown): void {
  const incoming = postOf(payload);
  if (incoming === null) return;

  replaceCardContent(queryClient, incoming.id, (held) => mergeServedPost(incoming, held));
}

/**
 * `post:deleted` — elle quitte TOUS les écrans qui la montrent, Réels compris
 * (#7227, W8 ; #7341 pour le hashtag, le profil et les enregistrées).
 *
 * Le fil des Réels la perd aussi — exactement le périmètre qu'iOS observe
 * (`ReelsViewModel.swift:169-183`, `postDeleted` SEUL parmi les événements de
 * publication) : le fil des Réels est un fil D'AFFINITÉ résolu par le serveur,
 * y insérer une carte créée côté client inventerait un tri que le serveur n'a
 * pas décidé. La suppression, elle, ne trie rien — elle retire une carte que
 * TOUT écran doit cesser de montrer. Les caisses parcourues sont celles du
 * registre (`removeCardPost`, `card-caches.ts`), toutes graines comprises.
 */
export function applyPostDeleted(queryClient: QueryClient, payload: unknown): void {
  const postId = objectOf(payload)?.postId;
  if (typeof postId !== 'string') return;

  removeCardPost(queryClient, postId);
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
 * **LE ❤️ SERVI SE POSE À CHAQUE CAISSE QUI MONTRE LA CARTE, UNE SEULE FOIS**
 * (revue-correction W8, #7227 ; #7341) — le Flux, TOUTES les graines de
 * Réels, les enregistrées, la page d'un hashtag, le profil de l'auteur, la
 * fiche : le registre `card-caches.ts` les tient, et c'est `updateCardPost`
 * qui les parcourt. Site UNIQUE, partagé par les DEUX voies que la passerelle
 * emprunte pour un cœur : `post:liked`/`post:unliked`
 * (`socket.ts#onPostLikeChanged`, la voie NOMINALE d'un POST/REEL) et
 * `post:reaction-added`/`post:reaction-removed` (ci-dessous).
 *
 * Cette énumération a été RECOPIÉE ici jusqu'à #7341, et la recopie a divergé
 * deux fois : la fiche a manqué (#7227), puis le hashtag et le profil — un
 * cœur posé depuis un autre appareil n'y arrivait jamais.
 *
 * `isLikedByMe` ne bascule que pour le geste du LECTEUR (un autre de SES
 * appareils) — le cœur d'un autre ne remplit jamais le mien ; le compte, lui,
 * est ABSOLU et remplace toujours l'estimation optimiste.
 */
export function applyServedLike(
  queryClient: QueryClient,
  change: { readonly postId: string; readonly on: boolean; readonly byViewer: boolean; readonly likeCount: number },
): void {
  const { postId } = change;
  const toggle = { postId, kind: 'like' as const, on: change.on };
  const served = { postId, kind: 'like' as const, count: change.likeCount };

  updateCardPost(queryClient, postId, (post) => withServedCount(change.byViewer ? togglePost(post, toggle) : post, served));
}

/**
 * **LE FAVORI SERVI SE POSE AUX MÊMES CAISSES QUE LE CŒUR** (revue-correction
 * W8, #7227 ; #7341) — `post:bookmarked` n'écrivait QUE le Flux, pendant que
 * le geste LOCAL tenait plusieurs caisses (`feed-gestures.ts`, `setOn`) et
 * qu'iOS réconcilie aussi son pager de Réels (`ReelsViewModel.swift:139-163`,
 * `applyServerBookmark`) et les publications d'un profil
 * (`ProfileUserPostsList.swift`). La divergence se voyait là où aucun geste
 * local ne l'avait masquée : un favori posé depuis un AUTRE appareil
 * n'atteignait ni le pager, ni la fiche, ni un hashtag, ni un profil.
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

  updateCardPost(queryClient, postId, (post) => {
    const toggled = togglePost(post, toggle);
    return bookmarkCount === undefined ? toggled : withServedCount(toggled, { postId, kind: 'bookmark', count: bookmarkCount });
  });

  /**
   * **LE CORPUS DES ENREGISTRÉES EST AUSSI UNE APPARTENANCE** (#7286) —
   * `updateCardPost` vient d'y basculer le champ comme sur toute carte ;
   * pour le SIGNET, c'est en plus la composition du corpus qui change.
   *
   * RETIRER ôte la ligne sur-le-champ : la laisser basculée garderait, dans la
   * liste des publications enregistrées, une publication qui ne l'est plus.
   *
   * ENREGISTRER INVALIDE plutôt que d'insérer, et c'est la seule des deux
   * directions où l'écho en sait moins que le serveur : la PLACE d'une ligne
   * dépend de `PostBookmark.createdAt`, que la charge ne porte pas. Une
   * insertion en tête serait juste neuf fois sur dix et fausse la dixième,
   * pour un corpus qu'un seul aller-retour rend exactement. `invalidateQueries`
   * ne refait la requête que si l'écran est MONTÉ ; sinon il marque périmé, et
   * le geste local a déjà posé la ligne au bon endroit.
   */
  if (change.on) {
    void queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
    return;
  }
  writeCardCache<FeedInfiniteData>(queryClient, BOOKMARKS_QUERY_KEY, (data) => withoutBookmark(data, postId));
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

/**
 * **LES TRADUCTIONS LIVRÉES EN DIRECT** (#7383, #7382) — le pipeline NLLB
 * livre UNE traduction d'UN contenu, jamais la carte entière :
 * `post:translation-updated` pour `Post.content`,
 * `media:caption-translation-updated` pour `PostMedia.caption`. Les deux
 * charges partagent la forme `{ postId, language, translation }`
 * (`packages/shared/types/post.ts`), et `postId` est OBLIGATOIRE sur les deux
 * depuis leur naissance — la passerelle le résout même pour un média de
 * commentaire (`MediaCaptionTranslationService.ts`, l'audience en dépend).
 *
 * **LA LOI NE FAIT QUE RANGER, ELLE N'ÉLIT RIEN.** La traduction entre dans la
 * carte de SON contenu, à sa langue ; ce que le lecteur voit est redescendu à
 * chaque peinture par le résolveur du web-v2 (`resolveFeedCardModel` →
 * `served()` → `resolvePrismTranslation`), qui parcourt le prisme dans l'ordre
 * et fait concourir la langue d'origine à SON rang. Une traduction de rang 2
 * fait donc basculer une publication écrite hors du prisme ; une traduction
 * hors du prisme est rangée sans rien changer ; et aucune « dernière reçue »
 * ne détrône un rang supérieur — miroir de `FeedViewModel.applyPostTranslation`
 * (iOS, #6531), qui fusionne puis re-résout.
 *
 * **CHAQUE ÉCRAN QUI MONTRE LA CARTE LA REÇOIT** — le registre
 * (`updateCardPost`, `card-caches.ts`), Réels compris : une traduction ne
 * compose pas l'ordre du fil gelé, elle sert au lecteur le MÊME contenu dans
 * sa langue (iOS : `feedCache.patchEverywhere`, pager des Réels compris).
 */
type PostDelivery = TranslationDelivery & { readonly postId: string };

/** La paire vérifiée (`translation-delivery.ts`, site UNIQUE partagé avec la
 * traduction d'un COMMENTAIRE, #7394), plus l'adresse de la publication. */
const deliveryOf = (payload: unknown): PostDelivery | null => {
  const delivery = translationDeliveryOf(payload);
  const postId = objectOf(payload)?.postId;
  return delivery === null || !nonEmpty(postId) ? null : { ...delivery, postId };
};

/** `post:translation-updated` — le TEXTE de la publication (#7383). */
export function applyPostTranslation(queryClient: QueryClient, payload: unknown): void {
  const delivery = deliveryOf(payload);
  if (delivery === null) return;

  updateCardPost(queryClient, delivery.postId, (post) => {
    const translations = mergedTranslations(post.translations, delivery);
    return translations === null ? post : { ...post, translations };
  });
}

/**
 * `media:caption-translation-updated` — la LÉGENDE d'un média (#7382, #6280).
 * Le média se retrouve par `mediaId` DANS la publication que `postId` nomme.
 * Un média de COMMENTAIRE (`commentId` présent) voyage avec le `postId` de la
 * publication qui porte le commentaire : aucune carte ne le tient, donc rien
 * n'est parcouru.
 */
export function applyMediaCaptionTranslation(queryClient: QueryClient, payload: unknown): void {
  const delivery = deliveryOf(payload);
  const mediaId = objectOf(payload)?.mediaId;
  if (delivery === null || !nonEmpty(mediaId) || typeof objectOf(payload)?.commentId === 'string') return;

  updateCardPost(queryClient, delivery.postId, (post) => {
    const media = post.media ?? [];
    const held = media.find((m) => m.id === mediaId);
    const captionTranslations = held === undefined ? null : mergedTranslations(held.captionTranslations, delivery);
    return captionTranslations === null ? post : { ...post, media: media.map((m) => (m === held ? { ...m, captionTranslations } : m)) };
  });
}
