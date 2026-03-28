import { apiService } from './api.service';
import type {
  Post,
  PostComment,
  PostType,
  PostVisibility,
  PostView,
} from '@meeshy/shared/types/post';
import type { ApiResponse } from '@meeshy/shared/types';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface CreatePostRequest {
  readonly type?: PostType;
  readonly visibility?: PostVisibility;
  readonly visibilityUserIds?: string[];
  readonly content?: string;
  readonly communityId?: string;
  readonly storyEffects?: Record<string, unknown>;
  readonly moodEmoji?: string;
  readonly audioUrl?: string;
  readonly audioDuration?: number;
  readonly originalLanguage?: string;
  readonly mediaIds?: string[];
}

export interface UpdatePostRequest {
  readonly content?: string;
  readonly visibility?: PostVisibility;
  readonly visibilityUserIds?: string[];
  readonly storyEffects?: Record<string, unknown>;
  readonly moodEmoji?: string;
}

export interface RepostRequest {
  readonly content?: string;
  readonly isQuote?: boolean;
}

export interface FeedFilters {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CursorPaginatedResponse<T> {
  readonly success: boolean;
  readonly data: T[];
  readonly meta: {
    readonly pagination: {
      readonly total: number;
      readonly offset: number;
      readonly limit: number;
      readonly hasMore: boolean;
    };
    readonly nextCursor: string | null;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

function buildQuery(filters: FeedFilters): string {
  const params = new URLSearchParams();
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const postsService = {
  // ── Feed ────────────────────────────────────────────────────────────────

  async getFeed(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(
      `/posts/feed${buildQuery(filters)}`,
    );
    return response as unknown as CursorPaginatedResponse<Post>;
  },

  async getStories(): Promise<ApiResponse<Post[]>> {
    return apiService.get<ApiResponse<Post[]>>('/posts/feed/stories') as unknown as ApiResponse<Post[]>;
  },

  async getStatuses(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    return apiService.get<CursorPaginatedResponse<Post>>(
      `/posts/feed/statuses${buildQuery(filters)}`,
    ) as unknown as CursorPaginatedResponse<Post>;
  },

  async getUserPosts(userId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    return apiService.get<CursorPaginatedResponse<Post>>(
      `/posts/user/${userId}${buildQuery(filters)}`,
    ) as unknown as CursorPaginatedResponse<Post>;
  },

  async getCommunityPosts(communityId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    return apiService.get<CursorPaginatedResponse<Post>>(
      `/posts/community/${communityId}${buildQuery(filters)}`,
    ) as unknown as CursorPaginatedResponse<Post>;
  },

  async getBookmarks(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    return apiService.get<CursorPaginatedResponse<Post>>(
      `/posts/bookmarks${buildQuery(filters)}`,
    ) as unknown as CursorPaginatedResponse<Post>;
  },

  // ── Single Post ─────────────────────────────────────────────────────────

  async getPost(postId: string): Promise<ApiResponse<Post>> {
    return apiService.get<ApiResponse<Post>>(`/posts/${postId}`) as unknown as ApiResponse<Post>;
  },

  // ── CRUD ────────────────────────────────────────────────────────────────

  async createPost(data: CreatePostRequest): Promise<ApiResponse<Post>> {
    return apiService.post<ApiResponse<Post>>('/posts', data) as unknown as ApiResponse<Post>;
  },

  async updatePost(postId: string, data: UpdatePostRequest): Promise<ApiResponse<Post>> {
    return apiService.put<ApiResponse<Post>>(`/posts/${postId}`, data) as unknown as ApiResponse<Post>;
  },

  async deletePost(postId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return apiService.delete<ApiResponse<{ deleted: boolean }>>(`/posts/${postId}`) as unknown as ApiResponse<{ deleted: boolean }>;
  },

  // ── Interactions ────────────────────────────────────────────────────────

  async likePost(postId: string, emoji = '❤️'): Promise<ApiResponse<Post>> {
    return apiService.post<ApiResponse<Post>>(`/posts/${postId}/like`, { emoji }) as unknown as ApiResponse<Post>;
  },

  async unlikePost(postId: string): Promise<ApiResponse<Post>> {
    return apiService.delete<ApiResponse<Post>>(`/posts/${postId}/like`) as unknown as ApiResponse<Post>;
  },

  async bookmarkPost(postId: string): Promise<ApiResponse<{ bookmarked: boolean }>> {
    return apiService.post<ApiResponse<{ bookmarked: boolean }>>(`/posts/${postId}/bookmark`) as unknown as ApiResponse<{ bookmarked: boolean }>;
  },

  async unbookmarkPost(postId: string): Promise<ApiResponse<{ bookmarked: boolean }>> {
    return apiService.delete<ApiResponse<{ bookmarked: boolean }>>(`/posts/${postId}/bookmark`) as unknown as ApiResponse<{ bookmarked: boolean }>;
  },

  async repost(postId: string, data: RepostRequest = {}): Promise<ApiResponse<Post>> {
    return apiService.post<ApiResponse<Post>>(`/posts/${postId}/repost`, data) as unknown as ApiResponse<Post>;
  },

  async sharePost(postId: string, platform?: string): Promise<ApiResponse<{ shared: boolean; shareCount: number }>> {
    return apiService.post<ApiResponse<{ shared: boolean; shareCount: number }>>(
      `/posts/${postId}/share`,
      platform ? { platform } : undefined,
    ) as unknown as ApiResponse<{ shared: boolean; shareCount: number }>;
  },

  async pinPost(postId: string): Promise<ApiResponse<{ pinned: boolean }>> {
    return apiService.post<ApiResponse<{ pinned: boolean }>>(`/posts/${postId}/pin`) as unknown as ApiResponse<{ pinned: boolean }>;
  },

  async unpinPost(postId: string): Promise<ApiResponse<{ pinned: boolean }>> {
    return apiService.delete<ApiResponse<{ pinned: boolean }>>(`/posts/${postId}/pin`) as unknown as ApiResponse<{ pinned: boolean }>;
  },

  async viewPost(postId: string, duration?: number): Promise<ApiResponse<{ viewed: boolean }>> {
    return apiService.post<ApiResponse<{ viewed: boolean }>>(
      `/posts/${postId}/view`,
      duration ? { duration } : undefined,
    ) as unknown as ApiResponse<{ viewed: boolean }>;
  },

  async getPostViews(postId: string, limit = 50, offset = 0): Promise<ApiResponse<{ items: PostView[]; pagination: { total: number; offset: number; limit: number; hasMore: boolean } }>> {
    return apiService.get<ApiResponse<{ items: PostView[]; pagination: { total: number; offset: number; limit: number; hasMore: boolean } }>>(
      `/posts/${postId}/views?limit=${limit}&offset=${offset}`,
    ) as unknown as ApiResponse<{ items: PostView[]; pagination: { total: number; offset: number; limit: number; hasMore: boolean } }>;
  },

  // ── Translation ─────────────────────────────────────────────────────────

  async translatePost(postId: string, targetLanguage: string): Promise<ApiResponse<{ requested: boolean; targetLanguage: string }>> {
    return apiService.post<ApiResponse<{ requested: boolean; targetLanguage: string }>>(
      `/posts/${postId}/translate`,
      { targetLanguage },
    ) as unknown as ApiResponse<{ requested: boolean; targetLanguage: string }>;
  },

  // ── Comments ────────────────────────────────────────────────────────────

  async getComments(postId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<PostComment>> {
    return apiService.get<CursorPaginatedResponse<PostComment>>(
      `/posts/${postId}/comments${buildQuery(filters)}`,
    ) as unknown as CursorPaginatedResponse<PostComment>;
  },

  async getCommentReplies(postId: string, commentId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<PostComment>> {
    return apiService.get<CursorPaginatedResponse<PostComment>>(
      `/posts/${postId}/comments/${commentId}/replies${buildQuery(filters)}`,
    ) as unknown as CursorPaginatedResponse<PostComment>;
  },

  async createComment(postId: string, content: string, parentId?: string): Promise<ApiResponse<PostComment>> {
    return apiService.post<ApiResponse<PostComment>>(
      `/posts/${postId}/comments`,
      parentId ? { content, parentId } : { content },
    ) as unknown as ApiResponse<PostComment>;
  },

  async deleteComment(postId: string, commentId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return apiService.delete<ApiResponse<{ deleted: boolean }>>(
      `/posts/${postId}/comments/${commentId}`,
    ) as unknown as ApiResponse<{ deleted: boolean }>;
  },

  async likeComment(postId: string, commentId: string, emoji = '❤️'): Promise<ApiResponse<PostComment>> {
    return apiService.post<ApiResponse<PostComment>>(
      `/posts/${postId}/comments/${commentId}/like`,
      { emoji },
    ) as unknown as ApiResponse<PostComment>;
  },

  async unlikeComment(postId: string, commentId: string): Promise<ApiResponse<PostComment>> {
    return apiService.delete<ApiResponse<PostComment>>(
      `/posts/${postId}/comments/${commentId}/like`,
    ) as unknown as ApiResponse<PostComment>;
  },
};
