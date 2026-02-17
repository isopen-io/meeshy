/**
 * Types partagés pour les posts, stories et statuts
 * Utilisés par le gateway, le frontend web et l'app iOS
 */

// =====================================================
// ENUMS
// =====================================================

export type PostType = 'POST' | 'STORY' | 'STATUS';
export type PostVisibility = 'PUBLIC' | 'FRIENDS' | 'COMMUNITY' | 'PRIVATE' | 'EXCEPT' | 'ONLY';

// =====================================================
// CORE INTERFACES
// =====================================================

export interface PostAuthor {
  readonly id: string;
  readonly username: string;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
  readonly avatarUrl?: string | null;
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
  readonly likeCount: number;
  readonly replyCount: number;
  readonly reactionSummary?: Record<string, number> | null;
  readonly isEdited?: boolean;
  readonly isDeleted?: boolean;
  readonly createdAt: string | Date;
  readonly author?: PostAuthor;
}

export interface Post {
  readonly id: string;
  readonly authorId: string;
  readonly type: PostType;
  readonly visibility: PostVisibility;
  readonly visibilityUserIds?: readonly string[];
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  readonly communityId?: string | null;
  readonly moodEmoji?: string | null;
  readonly audioUrl?: string | null;
  readonly audioDuration?: number | null;
  readonly storyEffects?: Record<string, unknown> | null;
  readonly reactions?: readonly PostReaction[] | null;
  readonly reactionSummary?: Record<string, number> | null;
  readonly reactionCount?: number;
  readonly likeCount: number;
  readonly commentCount: number;
  readonly repostCount: number;
  readonly viewCount: number;
  readonly bookmarkCount: number;
  readonly shareCount: number;
  readonly isPinned: boolean;
  readonly isEdited: boolean;
  readonly isDeleted?: boolean;
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
}

export interface StoryCreatedEventData {
  readonly story: Post;
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
