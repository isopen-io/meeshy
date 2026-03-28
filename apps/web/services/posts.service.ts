import { apiService } from './api.service';
import type {
  Post,
  PostComment,
  PostType,
  PostVisibility,
  PostView,
} from '@meeshy/shared/types/post';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface MobileTranscriptionSegment {
  readonly text: string;
  readonly start?: number;
  readonly end?: number;
  readonly speaker_id?: string;
}

export interface MobileTranscription {
  readonly text: string;
  readonly language: string;
  readonly confidence?: number;
  readonly duration_ms?: number;
  readonly segments?: MobileTranscriptionSegment[];
}

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
  readonly mobileTranscription?: MobileTranscription;
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
// Helpers
// ---------------------------------------------------------------------------

function buildQuery(filters: FeedFilters): string {
  const params = new URLSearchParams();
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// apiService.get<T>() returns ApiResponse<T> = { success, data: T }
// The server response body is at response.data
// For cursor-paginated endpoints, the body IS the CursorPaginatedResponse
function unwrap<T>(response: { data?: T }): T {
  return response.data as T;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const postsService = {
  // ── Feed ────────────────────────────────────────────────────────────────

  async getFeed(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/feed${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getStories(): Promise<{ success: boolean; data: Post[] }> {
    const response = await apiService.get<{ success: boolean; data: Post[] }>('/posts/feed/stories');
    return unwrap(response);
  },

  async getStatuses(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/feed/statuses${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getStatusesDiscover(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/feed/statuses/discover${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getUserPosts(userId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/user/${userId}${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getCommunityPosts(communityId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/community/${communityId}${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getBookmarks(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/bookmarks${buildQuery(filters)}`);
    return unwrap(response);
  },

  // ── Single Post ─────────────────────────────────────────────────────────

  async getPost(postId: string): Promise<{ success: boolean; data: Post }> {
    const response = await apiService.get<{ success: boolean; data: Post }>(`/posts/${postId}`);
    return unwrap(response);
  },

  // ── CRUD ────────────────────────────────────────────────────────────────

  async createPost(data: CreatePostRequest): Promise<{ success: boolean; data: Post }> {
    const response = await apiService.post<{ success: boolean; data: Post }>('/posts', data);
    return unwrap(response);
  },

  async updatePost(postId: string, data: UpdatePostRequest): Promise<{ success: boolean; data: Post }> {
    const response = await apiService.put<{ success: boolean; data: Post }>(`/posts/${postId}`, data);
    return unwrap(response);
  },

  async deletePost(postId: string): Promise<{ success: boolean; data: { deleted: boolean } }> {
    const response = await apiService.delete<{ success: boolean; data: { deleted: boolean } }>(`/posts/${postId}`);
    return unwrap(response);
  },

  // ── Interactions ────────────────────────────────────────────────────────

  async likePost(postId: string, emoji = '❤️'): Promise<unknown> {
    const response = await apiService.post(`/posts/${postId}/like`, { emoji });
    return unwrap(response);
  },

  async unlikePost(postId: string): Promise<unknown> {
    const response = await apiService.delete(`/posts/${postId}/like`);
    return unwrap(response);
  },

  async bookmarkPost(postId: string): Promise<{ bookmarked: boolean }> {
    const response = await apiService.post<{ bookmarked: boolean }>(`/posts/${postId}/bookmark`);
    return unwrap(response);
  },

  async unbookmarkPost(postId: string): Promise<{ bookmarked: boolean }> {
    const response = await apiService.delete<{ bookmarked: boolean }>(`/posts/${postId}/bookmark`);
    return unwrap(response);
  },

  async repost(postId: string, data: RepostRequest = {}): Promise<{ success: boolean; data: Post }> {
    const response = await apiService.post<{ success: boolean; data: Post }>(`/posts/${postId}/repost`, data);
    return unwrap(response);
  },

  async sharePost(postId: string, platform?: string): Promise<{ shared: boolean; shareCount: number }> {
    const response = await apiService.post<{ shared: boolean; shareCount: number }>(
      `/posts/${postId}/share`,
      platform ? { platform } : undefined,
    );
    return unwrap(response);
  },

  async pinPost(postId: string): Promise<{ pinned: boolean }> {
    const response = await apiService.post<{ pinned: boolean }>(`/posts/${postId}/pin`);
    return unwrap(response);
  },

  async unpinPost(postId: string): Promise<{ pinned: boolean }> {
    const response = await apiService.delete<{ pinned: boolean }>(`/posts/${postId}/pin`);
    return unwrap(response);
  },

  async viewPost(postId: string, duration?: number): Promise<{ viewed: boolean }> {
    const response = await apiService.post<{ viewed: boolean }>(
      `/posts/${postId}/view`,
      duration ? { duration } : undefined,
    );
    return unwrap(response);
  },

  async getPostViews(postId: string, limit = 50, offset = 0): Promise<{ items: PostView[]; pagination: { total: number; offset: number; limit: number; hasMore: boolean } }> {
    const response = await apiService.get<{ items: PostView[]; pagination: { total: number; offset: number; limit: number; hasMore: boolean } }>(
      `/posts/${postId}/views?limit=${limit}&offset=${offset}`,
    );
    return unwrap(response);
  },

  // ── Translation ─────────────────────────────────────────────────────────

  async translatePost(postId: string, targetLanguage: string): Promise<{ requested: boolean; targetLanguage: string }> {
    const response = await apiService.post<{ requested: boolean; targetLanguage: string }>(
      `/posts/${postId}/translate`,
      { targetLanguage },
    );
    return unwrap(response);
  },

  // ── Comments ────────────────────────────────────────────────────────────

  async getComments(postId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<PostComment>> {
    const response = await apiService.get<CursorPaginatedResponse<PostComment>>(`/posts/${postId}/comments${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getCommentReplies(postId: string, commentId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<PostComment>> {
    const response = await apiService.get<CursorPaginatedResponse<PostComment>>(`/posts/${postId}/comments/${commentId}/replies${buildQuery(filters)}`);
    return unwrap(response);
  },

  async createComment(postId: string, content: string, parentId?: string): Promise<{ success: boolean; data: PostComment }> {
    const response = await apiService.post<{ success: boolean; data: PostComment }>(
      `/posts/${postId}/comments`,
      parentId ? { content, parentId } : { content },
    );
    return unwrap(response);
  },

  async deleteComment(postId: string, commentId: string): Promise<{ success: boolean; data: { deleted: boolean } }> {
    const response = await apiService.delete<{ success: boolean; data: { deleted: boolean } }>(`/posts/${postId}/comments/${commentId}`);
    return unwrap(response);
  },

  async likeComment(postId: string, commentId: string, emoji = '❤️'): Promise<unknown> {
    const response = await apiService.post(`/posts/${postId}/comments/${commentId}/like`, { emoji });
    return unwrap(response);
  },

  async unlikeComment(postId: string, commentId: string): Promise<unknown> {
    const response = await apiService.delete(`/posts/${postId}/comments/${commentId}/like`);
    return unwrap(response);
  },

  // ── Story Background Audio ──────────────────────────────────────────────

  async getStoryAudioLibrary(query?: string, limit = 20): Promise<{ id: string; title: string; duration: number; fileUrl: string; usageCount: number }[]> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('limit', String(limit));
    const qs = params.toString();
    const response = await apiService.get<{ id: string; title: string; duration: number; fileUrl: string; usageCount: number }[]>(
      `/stories/audio${qs ? `?${qs}` : ''}`,
    );
    return unwrap(response);
  },

  async trackStoryAudioUse(audioId: string): Promise<void> {
    await apiService.post(`/stories/audio/${audioId}/use`);
  },
};
