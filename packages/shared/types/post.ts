/**
 * Types partagés pour les posts, stories et statuts
 * Utilisés par le gateway, le frontend web et l'app iOS
 */

import type { PostReference, ReferenceAccess } from './post-reference.js';

// =====================================================
// ENUMS
// =====================================================

export type PostType = 'POST' | 'REEL' | 'STORY' | 'STATUS';
export type PostVisibility = 'PUBLIC' | 'FRIENDS' | 'COMMUNITY' | 'PRIVATE' | 'EXCEPT' | 'ONLY';

/**
 * Audience par défaut de TOUTE publication — POST, REEL, STORY, STATUS
 * confondus (règle produit 2026-08-23) : on publie public, on restreint
 * ensuite. Le composer expose les six `PostVisibility` avant l'envoi et
 * l'édition permet de resserrer après coup ; ce qui est fixé ici, c'est
 * uniquement la case cochée à l'ouverture.
 *
 * Source unique : les clients qui laissent `visibility` absent (web
 * `storyService.createStory`, optimiste `useCreateStoryMutation`, composer
 * story) DOIVENT lire cette constante — un défaut recopié en littéral est
 * exactement ce qui avait laissé les stories web à `FRIENDS` pendant que les
 * posts et les réels naissaient publics.
 */
export const DEFAULT_PUBLICATION_VISIBILITY = 'PUBLIC' as const satisfies PostVisibility;

// =====================================================
// TRACKING LINKS (parité avec Message — metadata.trackingLinks)
// =====================================================

/**
 * Mapping `{ url, token }` d'une URL brute détectée dans le contenu vers son
 * lien tracé `/l/<token>`. Identique au mécanisme des messages : le client rend
 * le lien (texte + façade vidéo) vers `/l/<token>` SANS réécrire l'URL d'origine
 * (l'aperçu vidéo et l'URL lisible sont préservés).
 * @see schema.prisma Post.metadata / PostComment.metadata
 */
export interface ContentTrackingLink {
  readonly url: string;
  readonly token: string;
}

/**
 * Métadonnées structurées libres d'un post/commentaire (parité Message.metadata).
 * `trackingLinks` est rempli automatiquement à la création quand le contenu
 * contient des URLs brutes.
 */
export interface PostMetadata {
  readonly trackingLinks?: readonly ContentTrackingLink[];
  readonly [key: string]: unknown;
}

// =====================================================
// CORE INTERFACES
// =====================================================

export interface PostAuthor {
  readonly id: string;
  readonly username: string;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
  /**
   * Présence — servie UNIQUEMENT sur le chemin stories (`storyAuthorSelect`
   * gateway) pour que l'interstitiel d'identité du viewer résolve l'état de
   * présence au moment du switch de groupe. Absent des payloads posts/feed.
   */
  readonly isOnline?: boolean;
  readonly lastActiveAt?: Date | string | null;
}

export interface PostMedia {
  readonly id: string;
  readonly fileName?: string;
  readonly originalName?: string;
  readonly mimeType: string;
  readonly fileSize?: number;
  readonly fileUrl: string;
  readonly thumbnailUrl?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly duration?: number | null;
  readonly order: number;
  readonly caption?: string | null;
  readonly alt?: string | null;
}

export interface PostComment {
  readonly id: string;
  readonly postId?: string;
  readonly authorId?: string;
  readonly parentId?: string | null;
  readonly content: string;
  readonly originalLanguage?: string | null;
  readonly translations?: unknown;
  /** Métadonnées structurées — porte `trackingLinks` (cf. {@link PostMetadata}). */
  readonly metadata?: PostMetadata | null;
  /** Copie hissée top-level de `metadata.trackingLinks` sur le payload socket. */
  readonly trackingLinks?: readonly ContentTrackingLink[];
  readonly likeCount: number;
  readonly replyCount: number;
  readonly reactionSummary?: Record<string, number> | null;
  readonly currentUserReactions?: readonly string[];
  readonly isLikedByMe?: boolean;
  readonly isEdited?: boolean;
  /**
   * Effets visuels du commentaire (bitmask partagé avec les messages —
   * cf. message-effect-flags.ts : GLOW/PULSE/RAINBOW/SPARKLE bits 16-23).
   * Le champ voyageait déjà dans les payloads runtime mais était invisible
   * du contrat TS (risque de strip par un schéma de réponse Fastify).
   */
  readonly effectFlags?: number;
  readonly deletedAt?: string | Date | null;
  readonly createdAt: string | Date;
  readonly author?: PostAuthor;
  /**
   * Média unique attaché au commentaire (image/vidéo/audio). Réutilise le modèle
   * {@link PostMedia} via le FK `commentId`. Un commentaire ne porte qu'un seul
   * média ; la relation reste un tableau pour cohérence avec le pipeline posts.
   */
  readonly media?: readonly PostMedia[];
}

export interface Post {
  readonly id: string;
  readonly authorId: string;
  readonly type: PostType;
  readonly visibility: PostVisibility;
  readonly visibilityUserIds?: readonly string[];
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  readonly translations?: unknown;
  /**
   * Métadonnées structurées (parité Message.metadata) — porte notamment
   * `trackingLinks: [{ url, token }]` pour rendre les URLs brutes du contenu
   * cliquables/tracées vers `/l/<token>` sans réécrire l'URL d'origine.
   */
  readonly metadata?: PostMetadata | null;
  /**
   * Copie hissée top-level de `metadata.trackingLinks` sur les payloads socket
   * (`post:created`/`story:created`/`status:created`), miroir exact du hoist
   * `trackingLinks` des messages. Les réponses REST exposent `metadata`.
   */
  readonly trackingLinks?: readonly ContentTrackingLink[];
  readonly communityId?: string | null;
  readonly moodEmoji?: string | null;
  readonly audioUrl?: string | null;
  readonly audioDuration?: number | null;
  readonly storyEffects?: unknown;
  readonly reactions?: readonly PostReaction[] | null;
  readonly reactionSummary?: Record<string, number> | null;
  readonly reactionCount?: number;
  readonly currentUserReactions?: readonly string[];
  readonly isLikedByMe?: boolean;
  readonly bookmarkedAt?: string | Date | null;
  readonly likeCount: number;
  readonly commentCount: number;
  readonly repostCount: number;
  readonly viewCount: number;
  readonly bookmarkCount: number;
  readonly shareCount: number;
  readonly isPinned: boolean;
  readonly isEdited: boolean;
  /**
   * Horodatage de la dernière édition de CONTENU (texte / storyEffects /
   * médias) — distinct de `updatedAt` qui bouge sur chaque écriture
   * (compteurs inclus). null/absent = jamais édité en contenu. Les clients
   * s'en servent pour céder la garde « viewed monotone » après une édition
   * de story (reset d'engagement).
   */
  readonly contentEditedAt?: string | Date | null;
  readonly deletedAt?: string | Date | null;
  readonly isQuote?: boolean;
  readonly repostOfId?: string | null;
  /**
   * La RACINE de la chaîne de reposts, hydratée par le serveur
   * (`PostService.repostPost` : `original.originalRepostOfId ?? original.repostOfId
   * ?? original.id`) et servie par `postInclude`. `repostOfId` ne nomme que le
   * maillon PRÉCÉDENT — un cran, pas la source.
   *
   * Le champ voyageait déjà dans les charges utiles sans figurer au contrat :
   * les clients ne pouvaient donc pas replier une chaîne sur sa racine
   * (`repostTargetId`, `utils/repost-target.ts`).
   */
  readonly originalRepostOfId?: string | null;
  readonly expiresAt?: string | Date | null;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
  readonly author?: PostAuthor;
  readonly media?: readonly PostMedia[];
  readonly comments?: readonly PostComment[];
  readonly repostOf?: Partial<Post> | null;
  /**
   * Les personnes que ce post nomme, avec leur mode d'affichage — `postMentions`
   * (relation Prisma) aplati et RÉSOLU par le serveur sous ce nom exposé
   * (`withMentions`, `services/gateway/src/services/posts/postReferences.ts`).
   * `PostContentText` ne linkifie que les `@handle` qui y figurent.
   */
  readonly mentions?: readonly PostReference[];
  /**
   * Le droit du LECTEUR d'ouvrir ce contenu expiré parce qu'il y est
   * référencé — déclaré par le serveur (`resolveReferenceAccess`), jamais
   * recalculé depuis `expiresAt` côté client.
   */
  readonly referenceAccess?: ReferenceAccess;
}

export interface PostReaction {
  readonly userId: string;
  readonly emoji: string;
  readonly createdAt: string;
}

export interface PostView {
  readonly id: string;
  readonly postId: string;
  readonly userId: string;
  readonly duration?: number | null;
  readonly createdAt: string | Date;
  readonly user?: PostAuthor;
}

// =====================================================
// EVENT DATA INTERFACES (Socket.IO payloads)
// =====================================================

export interface PostCreatedEventData {
  readonly post: Post;
  /**
   * Echoed back from the createPost request's `X-Client-Mutation-Id` header so
   * an offline author can reconcile its optimistic temp post (keyed by the cmid)
   * with the authoritative server post on the `post:created` broadcast, instead
   * of rendering a duplicate (U1). Absent for posts created without a cmid.
   */
  readonly clientMutationId?: string;
}

export interface PostUpdatedEventData {
  readonly post: Post;
}

export interface PostDeletedEventData {
  readonly postId: string;
  readonly authorId: string;
}

export interface PostLikedEventData {
  readonly postId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly likeCount: number;
  readonly reactionSummary: Record<string, number>;
}

export interface PostUnlikedEventData {
  readonly postId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly likeCount: number;
  readonly reactionSummary: Record<string, number>;
}

export interface PostRepostedEventData {
  readonly originalPostId: string;
  readonly repost: Post;
}

export interface PostBookmarkedEventData {
  readonly postId: string;
  readonly bookmarked: boolean;
  /**
   * Absolute bookmark count AFTER the mutation — broadcast so the feed, reel
   * viewer and post detail reconcile the displayed count without a reload
   * (mirrors `likeCount` on {@link PostLikedEventData}). The bookmark event is
   * personal (emitted only to the acting user's sockets via `emitToUser`).
   */
  readonly bookmarkCount: number;
}

export interface StoryCreatedEventData {
  readonly story: Post;
  /**
   * Parité U1 avec {@link PostCreatedEventData} — échoué depuis
   * `X-Client-Mutation-Id` sur `POST /posts` (type STORY).
   *
   * **Posé EN AVANCE d'un lecteur — mesuré le 2026-08-25, aucun client ne le
   * lit encore.** iOS décode `story:created` en `SocketStoryCreatedData`
   * (`MeeshySDK/Sockets/SocialSocketManager.swift`), qui ne déclare pas ce
   * champ et dont le sujet Combine ne porte que l'`APIPost` ; le web n'a
   * AUCUNE occurrence de `clientMutationId` ; Android le déclare
   * (`SocketEvents.kt`) sans le consommer. La réconciliation d'un item
   * optimiste par cmid, telle que `PostCreatedEventData` la sert déjà pour
   * POST et REEL, reste donc à CÂBLER côté clients.
   *
   * Ne pas relire ce champ comme une preuve que la réconciliation marche :
   * ce qu'un serveur TRANSPORTE et ce qu'un client SERT sont deux questions.
   * Absent pour une story créée sans cmid.
   */
  readonly clientMutationId?: string;
}

export interface StoryUpdatedEventData {
  readonly story: Post;
  /**
   * true when the edit was a CONTENT edit that wiped the story's engagement
   * (views, reactions, impressions) server-side — clients must mark the story
   * unseen again for every viewer. Absent/false on metadata-only updates
   * (visibility changes). The publication date (createdAt) never moves.
   */
  readonly engagementReset?: boolean;
}

export interface StoryDeletedEventData {
  readonly storyId: string;
  readonly authorId: string;
}

export interface StoryViewedEventData {
  readonly storyId: string;
  readonly viewerId: string;
  readonly viewerUsername: string;
  readonly viewCount: number;
}

/**
 * Réaction posée sur une story.
 *
 * `likeCount` / `reactionSummary` sont l'état ABSOLU du post APRÈS le geste —
 * mêmes champs, même rôle et même garantie que sur {@link PostLikedEventData}.
 * Ils ne sont pas décoratifs : un payload qui ne porte qu'`emoji` + `userId`
 * n'autorise qu'un comptage en `±1`, qui n'est ni idempotent sous double
 * livraison ni rattrapable après un événement manqué. Avec l'absolu, un
 * consommateur écrit la valeur reçue et converge quoi qu'il ait raté.
 */
export interface StoryReactedEventData {
  readonly storyId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly likeCount: number;
  readonly reactionSummary: Record<string, number>;
}

/**
 * Réaction RETIRÉE d'une story.
 *
 * `emoji` est la réaction réellement retirée — jamais une valeur par défaut.
 * L'émetteur ne la connaît qu'en la lisant AVANT la suppression de la ligne
 * `PostReaction` ; s'il ne la connaît pas, il n'a rien à annoncer et n'émet
 * pas. Les clients s'en servent pour retirer la puce correspondante de la
 * réaction du lecteur, geste qu'un emoji faux rend silencieusement inopérant.
 */
export interface StoryUnreactedEventData {
  readonly storyId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly likeCount: number;
  readonly reactionSummary: Record<string, number>;
}

export interface StatusCreatedEventData {
  readonly status: Post;
  /**
   * Parité U1 avec {@link PostCreatedEventData} — échoué depuis
   * `X-Client-Mutation-Id` sur `POST /posts` (type STATUS).
   *
   * **Posé EN AVANCE d'un lecteur** — même mesure que
   * {@link StoryCreatedEventData.clientMutationId} : `SocketStatusCreatedData`
   * (iOS) ne le déclare pas, le web ne connaît pas le champ, Android le
   * déclare sans le lire. Trois doc-comments clients affirment encore que
   * « le gateway n'échoue pas de cmid pour les statuts » — c'est désormais
   * faux SERVEUR et toujours vrai CLIENT ; le câblage est une dette ouverte.
   * Absent pour un status créé sans cmid.
   */
  readonly clientMutationId?: string;
}

export interface StatusUpdatedEventData {
  readonly status: Post;
}

export interface StatusDeletedEventData {
  readonly statusId: string;
  readonly authorId: string;
}

/** Jumeau STATUS de {@link StoryReactedEventData} — mêmes invariants. */
export interface StatusReactedEventData {
  readonly statusId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly likeCount: number;
  readonly reactionSummary: Record<string, number>;
}

/** Jumeau STATUS de {@link StoryUnreactedEventData} — mêmes invariants. */
export interface StatusUnreactedEventData {
  readonly statusId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly likeCount: number;
  readonly reactionSummary: Record<string, number>;
}

export interface CommentAddedEventData {
  readonly postId: string;
  readonly comment: PostComment;
  readonly commentCount: number;
  /**
   * cmid du POST créateur (header `X-Client-Mutation-Id`), ré-émis dans
   * l'écho pour que l'ÉMETTEUR réconcilie sa ligne optimiste (insérée sous
   * cet id local) au lieu d'en insérer une seconde sous l'id serveur.
   * Absent pour les clients legacy qui n'envoient pas de cmid.
   */
  readonly clientMutationId?: string;
}

export interface CommentUpdatedEventData {
  readonly postId: string;
  readonly comment: PostComment;
}

export interface CommentDeletedEventData {
  readonly postId: string;
  readonly commentId: string;
  /**
   * Le fil ENTIER retiré — la cible et tous ses descendants — car supprimer un
   * commentaire soft-delete tout son sous-arbre de réponses côté serveur.
   * Toujours non vide et toujours préfixé par `commentId` quand il est présent.
   *
   * Optionnel pour rester additif : les clients qui ne le lisent pas encore
   * gardent le comportement d'avant (retirer la seule cible). Un client qui le
   * lit DOIT se replier sur `[commentId]` quand il est absent — le rejeu
   * idempotent d'une suppression ne peut plus reconstruire le sous-arbre.
   */
  readonly deletedCommentIds?: readonly string[];
  /**
   * Le parent DIRECT de la cible, ou `null` si la cible était un commentaire
   * racine — c'est-à-dire l'unique ligne dont le `replyCount` bouge côté
   * serveur (`PostCommentService.deleteComment` : « Only the direct parent's
   * replyCount moves »). Sans lui, un client ne peut pas refléter ce
   * décrément : la cible qu'il faudrait interroger pour en déduire le parent
   * n'est en cache QUE si le fil était déplié — or l'affordance « N réponses »
   * ne s'affiche justement que replié.
   *
   * Optionnel, et ABSENT (jamais `null`) sur le rejeu idempotent du DELETE :
   * la suppression a déjà eu lieu, son décrément aussi. C'est cette absence
   * qui rend le miroir client idempotent — un client DOIT ne rien décrémenter
   * quand la clé manque, jamais deviner le parent depuis son cache.
   */
  readonly parentId?: string | null;
  readonly commentCount: number;
}

export interface CommentLikedEventData {
  readonly postId: string;
  readonly commentId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly likeCount: number;
}

/**
 * Jumelle DESCENDANTE de {@link CommentLikedEventData} — même forme, même
 * garantie. `likeCount` est le total ABSOLU du commentaire APRÈS retrait, pas
 * un décrément : un client écrit la valeur reçue, ce qui rend l'événement
 * idempotent sous double livraison et rattrapable après un manqué, exactement
 * comme la montante.
 *
 * Le couple calque `post:liked` / `post:unliked`. Sans la descendante, le
 * compteur d'un commentaire ne savait que MONTER en direct : la pose diffusait,
 * le retrait ne diffusait rien.
 */
export interface CommentUnlikedEventData {
  readonly postId: string;
  readonly commentId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly likeCount: number;
}

export interface PostTranslationUpdatedEventData {
  readonly postId: string;
  readonly language: string;
  readonly translation: {
    readonly text: string;
    readonly translationModel: string;
    readonly confidenceScore?: number;
    readonly createdAt: string;
  };
}

export interface CommentTranslationUpdatedEventData {
  readonly postId: string;
  readonly commentId: string;
  readonly language: string;
  readonly translation: {
    readonly text: string;
    readonly translationModel: string;
    readonly confidenceScore?: number;
    readonly createdAt: string;
  };
}

/**
 * Émis (`comment:media-updated`) quand le pipeline audio d'un média de commentaire
 * a produit une transcription ou des traductions. Le client remplace le commentaire
 * en cache par cette version enrichie (média transcrit/traduit).
 */
export interface CommentMediaUpdatedEventData {
  readonly postId: string;
  readonly commentId: string;
  readonly comment: PostComment;
}

export interface CommentReactionAggregation {
  readonly emoji: string;
  readonly count: number;
  readonly userIds: string[];
  readonly hasCurrentUser: boolean;
}

export interface CommentReactionUpdateEventData {
  readonly commentId: string;
  readonly postId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly aggregation: CommentReactionAggregation;
  readonly timestamp: Date | string;
}

export interface CommentReactionSyncEventData {
  readonly commentId: string;
  /**
   * Owning post id. Required so a client can locate the comment in the
   * post-scoped comment caches (`comments(postId)` → both the top-level list
   * and any `replies` sub-caches). The comment id alone is NOT a cache key.
   */
  readonly postId: string;
  readonly reactions: readonly CommentReactionAggregation[];
  readonly totalCount: number;
  readonly userReactions: readonly string[];
}

// =====================================================
// POST REACTION EVENT DATA (Phase 3 — privacy-trimmed)
// NO userIds, NO hasCurrentUser (count only)
// =====================================================

export interface PostReactionAggregation {
  readonly emoji: string;
  readonly count: number;
}

export interface PostReactionUpdateEventData {
  readonly postId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly aggregation: PostReactionAggregation;
  readonly timestamp: Date | string;
}

export interface PostReactionSyncEventData {
  readonly postId: string;
  readonly reactions: readonly PostReactionAggregation[];
  readonly totalCount: number;
  readonly userReactions: readonly string[];
}

export interface PostReactionAddData {
  readonly postId: string;
  readonly emoji: string;
}

export interface PostReactionRemoveData {
  readonly postId: string;
  readonly emoji: string;
}
