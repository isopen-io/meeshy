/**
 * Types partagés pour les posts, stories et statuts
 * Utilisés par le gateway, le frontend web et l'app iOS
 */

// =====================================================
// ENUMS
// =====================================================

export type PostType = 'POST' | 'REEL' | 'STORY' | 'STATUS';
export type PostVisibility = 'PUBLIC' | 'FRIENDS' | 'COMMUNITY' | 'PRIVATE' | 'EXCEPT' | 'ONLY';

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
  readonly deletedAt?: string | Date | null;
  readonly isQuote?: boolean;
  readonly repostOfId?: string | null;
  readonly expiresAt?: string | Date | null;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
  readonly author?: PostAuthor;
  readonly media?: readonly PostMedia[];
  readonly comments?: readonly PostComment[];
  readonly repostOf?: Partial<Post> | null;
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
}

export interface StoryUpdatedEventData {
  readonly story: Post;
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

export interface StoryReactedEventData {
  readonly storyId: string;
  readonly userId: string;
  readonly emoji: string;
}

export interface StoryUnreactedEventData {
  readonly storyId: string;
  readonly userId: string;
  readonly emoji: string;
}

export interface StatusCreatedEventData {
  readonly status: Post;
}

export interface StatusUpdatedEventData {
  readonly status: Post;
}

export interface StatusDeletedEventData {
  readonly statusId: string;
  readonly authorId: string;
}

export interface StatusReactedEventData {
  readonly statusId: string;
  readonly userId: string;
  readonly emoji: string;
}

export interface StatusUnreactedEventData {
  readonly statusId: string;
  readonly userId: string;
  readonly emoji: string;
}

export interface CommentAddedEventData {
  readonly postId: string;
  readonly comment: PostComment;
  readonly commentCount: number;
}

export interface CommentDeletedEventData {
  readonly postId: string;
  readonly commentId: string;
  readonly commentCount: number;
}

export interface CommentLikedEventData {
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
