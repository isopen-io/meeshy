import type { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

import {
  applyMediaAltTranslation,
  applyMediaCaptionTranslation,
  applyPostCreated,
  applyPostDeleted,
  applyPostReactionEvent,
  applyPostTranslation,
  applyPostUpdated,
  applyServedBookmark,
  applyServedLike,
  applyServedRepost,
  applyStoryChanged,
} from './feed-realtime';
import { STATUS_MOODS_QUERY_KEY } from './stories';

/**
 * **LE TEMPS RÉEL DES PUBLICATIONS** (#18914) — les écoutes des publications,
 * des stories, des humeurs et de leurs commentaires, sorties de `socket.ts`
 * par RESPONSABILITÉ : ce module branche ce que le Flux, le rail et la fiche
 * d'une publication affichent ; `socket.ts` garde la connexion, les
 * conversations et les familles personnelles. Le fichier d'origine passait le
 * plafond de 1 200 lignes, et la règle de budget interdit d'y ajouter avant
 * d'en extraire.
 *
 * Rien n'a changé de comportement : mêmes gestionnaires, mêmes lois (D-98 —
 * les règles vivent avec leurs caches, un écouteur ne tient que le
 * branchement), et `createRealtimeConnection` les pose et les retire avec la
 * connexion, comme avant.
 */

/** `PostLikedEventData` / `PostUnlikedEventData` (`@meeshy/shared/types/post`),
 * réduits aux trois champs que le fil lit — validés, jamais crus sur parole. */
type PostLikeEvent = { readonly postId: string; readonly userId: string; readonly likeCount: number };

function isPostLikeEvent(payload: unknown): payload is PostLikeEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.postId === 'string' && typeof p.userId === 'string' && Number.isFinite(p.likeCount);
}

/** `PostBookmarkedEventData` — PERSONNEL (émis aux seuls sockets de l'auteur
 * du geste), donc `bookmarked` décrit toujours le lecteur. */
type PostBookmarkEvent = { readonly postId: string; readonly bookmarked: boolean; readonly bookmarkCount?: number };

function isPostBookmarkEvent(payload: unknown): payload is PostBookmarkEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.postId === 'string' &&
    typeof p.bookmarked === 'boolean' &&
    (p.bookmarkCount === undefined || Number.isFinite(p.bookmarkCount))
  );
}

export type SocialRealtimeDeps = {
  readonly socket: SocketClient;
  readonly queryClient: QueryClient;
  /** Résolu à CHAQUE événement, jamais figé (doc-comment de `RealtimeDeps.viewerId`). */
  readonly viewerId: () => string;
};

/** Pose les écoutes des publications ; rend leur retrait. */
export function bindSocialRealtime(deps: SocialRealtimeDeps): () => void {
  /**
   * `comment:added` (#7151) — LA LISTE DES COMMENTAIRES SUIT LE FIL EN DIRECT.
   *
   * Sans cette ligne, le couple serait « écrit, testé, et jamais activé » — la
   * forme exacte que #7142 a coûtée au dépôt sur une autre surface.
   *
   * `import()`, JAMAIS statique — D-98 : « un écouteur temps réel n'IMPORTE pas
   * le cache qu'il met à jour ». Mesuré : l'import statique portait le chunk
   * `realtime` à 5,05 Ko pour un plafond de 5 ; garder la seule GARDE ici le
   * laissait encore à 5,01. La règle ENTIÈRE — forme et application — vit donc
   * avec le cache, et cette ligne ne fait que router.
   */
  const onCommentAdded = (payload: unknown): void => {
    void import('./publication-comments').then(({ applyCommentAdded }) => {
      applyCommentAdded(deps.queryClient, payload);
    });
  };

  /**
   * `comment:updated` / `comment:deleted` / `comment:liked` / `comment:unliked`
   * (#7227, W8) — LE FIL DE COMMENTAIRES SUIT LA PASSERELLE EN DIRECT, même
   * motif que `comment:added` juste au-dessus : la règle (garde de forme,
   * réécriture pure sur `commentsQueryKey`) vit dans `publication-comments.ts`
   * (D-40), ces lignes ne font que BRANCHER, par `import()` (D-98, chunk
   * `realtime` plafonné à 5 Ko).
   */
  const onCommentUpdated = (payload: unknown): void => {
    void import('./publication-comments').then(({ applyCommentUpdated }) => {
      applyCommentUpdated(deps.queryClient, payload);
    });
  };

  const onCommentDeleted = (payload: unknown): void => {
    void import('./publication-comments').then(({ applyCommentDeleted }) => {
      applyCommentDeleted(deps.queryClient, payload);
    });
  };

  const onCommentLikeChanged =
    (liked: boolean) =>
    (payload: unknown): void => {
      void import('./publication-comments').then(({ applyCommentLikeEvent }) => {
        applyCommentLikeEvent(deps.queryClient, payload, deps.viewerId(), liked);
      });
    };
  const onCommentLiked = onCommentLikeChanged(true);
  const onCommentUnliked = onCommentLikeChanged(false);

  /**
   * `comment:translation-updated` (#7394) — LE PRISME SUIT LE PIPELINE EN
   * DIRECT SUR UN COMMENTAIRE, jumeau de `post:translation-updated` (#7383).
   * Il n'était écouté NULLE PART : un commentaire écrit hors de la langue du
   * lecteur restait dans celle de son auteur jusqu'à la relecture du fil. La
   * loi (garde de forme, fusion par langue, caisse du fil) vit avec le cache
   * dans `publication-comments.ts` ; cette ligne ne fait que BRANCHER, par
   * `import()` comme ses quatre voisines (D-98).
   */
  const onCommentTranslationUpdated = (payload: unknown): void => {
    void import('./publication-comments').then(({ applyCommentTranslation }) => {
      applyCommentTranslation(deps.queryClient, payload);
    });
  };

  /**
   * `comment:media-updated` (#18921) — LE VOCAL D'UN COMMENTAIRE REÇOIT SA
   * TRANSCRIPTION EN DIRECT : la transcription et les pistes traduites se posent
   * sur le média en cache. La loi vit avec le cache (`publication-comments.ts`),
   * cette ligne ne fait que BRANCHER, par `import()` comme ses voisines (D-98).
   */
  const onCommentMediaUpdated = (payload: unknown): void => {
    void import('./publication-comments').then(({ applyCommentMediaUpdated }) => {
      applyCommentMediaUpdated(deps.queryClient, payload);
    });
  };

  /**
   * `story:reacted` / `story:unreacted` (#7227, W8) — LE RAIL SUIT LES
   * RÉACTIONS EN DIRECT. La règle (compte ABSOLU, garde « jamais le cœur
   * d'un autre ») vit dans `reaction-realtime.ts` — SÉPARÉ de
   * `story-reactions.ts` (le port du GESTE, importé STATIQUEMENT par le
   * lecteur, chunk `story_reader` déjà serré) — ; `import()`, même motif que
   * `comment:added`.
   */
  const onStoryReactionChanged =
    (plan: 'add' | 'remove') =>
    (payload: unknown): void => {
      void import('./reaction-realtime').then(({ applyStoryReactionEvent }) => {
        applyStoryReactionEvent(deps.queryClient, payload, { viewerId: deps.viewerId(), plan });
      });
    };
  const onStoryReacted = onStoryReactionChanged('add');
  const onStoryUnreacted = onStoryReactionChanged('remove');

  /**
   * `story:*`/`status:updated` (#5652, #6080, #16541) — LE RAIL SUIT LE FIL EN DIRECT : une
   * invalidation du plateau par famille, jamais une reconstruction locale du corpus
   * (`groupStoriesByAuthor` reste le SEUL site qui regroupe, D-14) ; seul le
   * réglage des commentaires se pose (`feed-realtime.ts#applyStoryChanged`).
   */
  const onStoryChanged = (payload?: unknown): void => {
    applyStoryChanged(deps.queryClient, payload);
  };
  /**
   * `status:created` / `status:updated` / `status:deleted` (#18914, WEB-05) —
   * L'HUMEUR D'UN AMI EN DIRECT. Les humeurs vivent sous leur propre clé
   * (`STATUS_MOODS_QUERY_KEY`, corpus `?scope=statuses`) — le rail, la
   * pastille des avatars, la feuille d'humeur — et `status:updated` ne périmait
   * que le plateau des stories. Une invalidation plutôt qu'une écriture : la
   * passerelle filtre la charge par audience, le corpus relu est la seule
   * forme sûre, et seul un écran qui l'observe le relit.
   */
  const onStatusMoodChanged = (): void => {
    void deps.queryClient.invalidateQueries({ queryKey: STATUS_MOODS_QUERY_KEY, exact: true });
  };
  const onStatusUpdated = (payload: unknown): void => {
    onStoryChanged(payload);
    onStatusMoodChanged();
  };
  /* `story:viewed` (#7116, revue) — le plateau comme ci-dessus, ET le compte
     des vues de l'auteur + sa feuille ouverte (`publication-views-realtime.ts`,
     `import()` : D-98, motif `story:reacted`). */
  const onStoryViewed = (payload: unknown): void => {
    onStoryChanged();
    void import('./publication-views-realtime').then(({ applyStoryViewedEvent }) => {
      applyStoryViewedEvent(deps.queryClient, payload);
    });
  };

  /**
   * `post:liked` / `post:unliked` / `post:bookmarked` (#6278, D-47) — LE FIL
   * SUIT LES GESTES EN DIRECT, par les DEUX mêmes fonctions pures que
   * l'optimiste (`lib/feed/interactions.ts`). Le compte diffusé est ABSOLU et
   * remplace l'estimation ; « aimé par moi » ne bascule que pour un geste du
   * LECTEUR (un autre de ses appareils) — le « j'aime » d'un autre ne remplit
   * jamais son cœur. Miroir `FeedView.swift:1331-1357`.
   *
   * **ET LES RÉELS, ET LA FICHE (#7227, W8)** — la MÊME carte, servie par un
   * fil de Réels (`ReelsViewModel.swift:117-128` : SEULS les likes et la
   * suppression y sont câblés, jamais `postCreated`/`postUpdated`) ou par
   * `/post/$post`. Les caisses vivent au registre (`card-caches.ts`, #7341 :
   * le hashtag, le profil et les enregistrées aussi), atteint par
   * `feed-realtime.ts#applyServedLike`, site UNIQUE partagé avec
   * `post:reaction-added`/`post:reaction-removed` : cet écouteur ne tient que
   * le branchement (D-98), et deux boucles recopiées ne peuvent plus diverger
   * d'une caisse.
   */
  const onPostLikeChanged =
    (on: boolean) =>
    (payload: unknown): void => {
      if (!isPostLikeEvent(payload)) return;
      applyServedLike(deps.queryClient, {
        postId: payload.postId,
        on,
        byViewer: payload.userId === deps.viewerId(),
        likeCount: payload.likeCount,
      });
    };
  const onPostLiked = onPostLikeChanged(true);
  const onPostUnliked = onPostLikeChanged(false);

  /**
   * `post:created` / `post:updated` / `post:deleted` (#7182) — LE FLUX APPREND
   * CE QUI ARRIVE. Ces trois événements étaient MUETS ici pendant que leurs
   * sept cousins (`post:liked`, `post:bookmarked`, les quatre `story:*`,
   * `comment:added`) étaient écoutés : une publication d'un ami n'atteignait
   * jamais le fil sans rechargement.
   *
   * Les lois vivent dans `feed-realtime.ts` — réconciliation par cmid,
   * idempotence, insertion en tête, préservation de l'état du lecteur — et
   * un écouteur ne tient QUE le branchement (D-98). L'import est STATIQUE et
   * c'est MESURÉ : `feed-realtime.ts` ne tient aucune requête, et le rendre
   * différé coûtait PLUS que le module lui-même (5,10 Ko contre 5,01 pour le
   * chunk `realtime` — trois `import()` et leur table de dépendances).
   */
  const onPostCreated = (payload: unknown): void => {
    applyPostCreated(deps.queryClient, payload);
  };

  const onPostUpdated = (payload: unknown): void => {
    applyPostUpdated(deps.queryClient, payload);
  };

  const onPostDeleted = (payload: unknown): void => {
    applyPostDeleted(deps.queryClient, payload);
  };

  /**
   * `post:bookmarked` — **ET LES RÉELS, ET LA FICHE (#7227, W8)**. Cet écho
   * n'écrivait que le Flux pendant que le geste LOCAL tenait plusieurs
   * caisses (`feed-gestures.ts#performPostGesture`) et qu'iOS réconcilie son
   * pager (`ReelsViewModel.swift:139-163`) : un favori posé depuis un AUTRE
   * appareil n'atteignait ni le pager ni la fiche. Les caisses vivent au
   * registre (`card-caches.ts`, #7341), atteint par
   * `feed-realtime.ts#applyServedBookmark`, à côté de ses jumelles du cœur —
   * cet écouteur ne tient que le branchement (D-98).
   */
  const onPostBookmarked = (payload: unknown): void => {
    if (!isPostBookmarkEvent(payload)) return;
    applyServedBookmark(deps.queryClient, {
      postId: payload.postId,
      on: payload.bookmarked,
      bookmarkCount: payload.bookmarkCount,
    });
  };

  /**
   * `post:reposted` (#6278 c) — LE COMPTE DE L'ORIGINAL SUIT le repost d'un
   * AUTRE lecteur ; le mien est déjà posé par l'optimiste. La loi (extraction
   * de `repost.repostOf.repostCount`, garde de forme) vit dans
   * `feed-realtime.ts#applyServedRepost` — cet écouteur ne tient que le
   * branchement (D-98).
   */
  const onPostReposted = (payload: unknown): void => {
    applyServedRepost(deps.queryClient, payload);
  };

  /**
   * `post:reaction-added` / `post:reaction-removed` (#7227, W8) — GARDÉS au
   * ❤️, miroir EXACT d'iOS (`FeedView.swift:1307-1325`). Le ❤️ sur un
   * POST/REEL part en pratique par `post:liked`/`post:unliked`
   * (`PostReactionHandler.ts:106-123`) ; les emojis NON-❤️ n'ont AUCUN champ
   * côté `FeedPost` — la règle (garde + application, feed/reels/détail) vit
   * dans `feed-realtime.ts`, importé STATIQUEMENT (D-98 mesure déjà le coût
   * de ce module dans le chunk `realtime` pour `post:created/updated/deleted`,
   * un `import()` de plus n'ajouterait rien).
   */
  const onPostReactionChanged = (payload: unknown): void => {
    applyPostReactionEvent(deps.queryClient, payload, deps.viewerId());
  };

  /**
   * `post:translation-updated` (#7383) et `media:caption-translation-updated`
   * (#6280, #7382) — LE PRISME SUIT LE PIPELINE EN DIRECT, sur CHAQUE écran
   * qui montre la carte. Le texte d'une publication n'était écouté NULLE PART
   * (iOS l'écoute sur le Flux, la fiche, le profil et les stories), et la
   * légende d'un média n'atteignait que le Flux (`updateFeed`, disparu) : sa
   * charge porte pourtant `postId` depuis sa naissance — c'est la garde locale
   * qui ne le lisait pas.
   *
   * **Et `media:alt-translation-updated` depuis #7392** — le TROISIÈME contenu
   * d'un média, qui n'avait AUCUN auditeur sur aucun client alors que la
   * passerelle le diffuse depuis #6737. C'est la chaîne qu'un lecteur d'écran
   * PRONONCE : la laisser muette revenait à faire élire une traduction par le
   * pipeline, la ranger, la pousser sur le fil — et n'en rien afficher.
   *
   * Les lois vivent dans `feed-realtime.ts` (validation, fusion par langue,
   * registre des caisses) ; ces écouteurs ne tiennent que le branchement
   * (D-98). TROIS contenus, trois cartes de traduction, jamais mélangées.
   */
  const onPostTranslationUpdated = (payload: unknown): void => {
    applyPostTranslation(deps.queryClient, payload);
  };

  const onMediaCaptionTranslationUpdated = (payload: unknown): void => {
    applyMediaCaptionTranslation(deps.queryClient, payload);
  };

  const onMediaAltTranslationUpdated = (payload: unknown): void => {
    applyMediaAltTranslation(deps.queryClient, payload);
  };

  const bindings: ReadonlyArray<readonly [string, (payload: unknown) => void]> = [
    [SERVER_EVENTS.COMMENT_ADDED, onCommentAdded],
    [SERVER_EVENTS.COMMENT_UPDATED, onCommentUpdated],
    [SERVER_EVENTS.COMMENT_DELETED, onCommentDeleted],
    [SERVER_EVENTS.COMMENT_LIKED, onCommentLiked],
    [SERVER_EVENTS.COMMENT_UNLIKED, onCommentUnliked],
    [SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, onCommentTranslationUpdated],
    [SERVER_EVENTS.COMMENT_MEDIA_UPDATED, onCommentMediaUpdated],
    [SERVER_EVENTS.STORY_CREATED, onStoryChanged],
    [SERVER_EVENTS.STORY_UPDATED, onStoryChanged],
    [SERVER_EVENTS.STATUS_CREATED, onStatusMoodChanged],
    [SERVER_EVENTS.STATUS_UPDATED, onStatusUpdated],
    [SERVER_EVENTS.STATUS_DELETED, onStatusMoodChanged],
    [SERVER_EVENTS.STORY_DELETED, onStoryChanged],
    [SERVER_EVENTS.STORY_VIEWED, onStoryViewed],
    [SERVER_EVENTS.STORY_REACTED, onStoryReacted],
    [SERVER_EVENTS.STORY_UNREACTED, onStoryUnreacted],
    [SERVER_EVENTS.POST_CREATED, onPostCreated],
    [SERVER_EVENTS.POST_UPDATED, onPostUpdated],
    [SERVER_EVENTS.POST_DELETED, onPostDeleted],
    [SERVER_EVENTS.POST_LIKED, onPostLiked],
    [SERVER_EVENTS.POST_UNLIKED, onPostUnliked],
    [SERVER_EVENTS.POST_BOOKMARKED, onPostBookmarked],
    [SERVER_EVENTS.POST_REPOSTED, onPostReposted],
    [SERVER_EVENTS.POST_REACTION_ADDED, onPostReactionChanged],
    [SERVER_EVENTS.POST_REACTION_REMOVED, onPostReactionChanged],
    [SERVER_EVENTS.POST_TRANSLATION_UPDATED, onPostTranslationUpdated],
    [SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, onMediaCaptionTranslationUpdated],
    [SERVER_EVENTS.MEDIA_ALT_TRANSLATION_UPDATED, onMediaAltTranslationUpdated],
  ];
  for (const [event, handler] of bindings) deps.socket.on<unknown>(event, handler);
  return () => {
    for (const [event, handler] of bindings) deps.socket.off<unknown>(event, handler);
  };
}
