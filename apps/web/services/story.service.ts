import { apiService } from './api.service';
import type { Post, PostVisibility, PostView } from '@meeshy/shared/types/post';
import type { ApiResponse } from '@meeshy/shared/types';

// ============================================================================
// Types
// ============================================================================

export interface CreateStoryRequest {
  readonly content?: string;
  readonly visibility?: PostVisibility;
  readonly visibilityUserIds?: readonly string[];
  readonly storyEffects?: Record<string, unknown>;
  readonly mediaIds?: readonly string[];
  readonly originalLanguage?: string;
}

export interface StoryViewersResponse {
  readonly viewers: readonly PostView[];
  readonly total: number;
}

// ============================================================================
// Service
// ============================================================================

class StoryService {
  async getStories(): Promise<Post[]> {
    const response = await apiService.get<Post[]>('/posts/feed/stories');
    return response.data ?? [];
  }

  async createStory(data: CreateStoryRequest): Promise<Post> {
    const response = await apiService.post<Post>('/posts', {
      type: 'STORY' as const,
      content: data.content,
      visibility: data.visibility ?? 'FRIENDS',
      visibilityUserIds: data.visibilityUserIds,
      storyEffects: data.storyEffects,
      mediaIds: data.mediaIds,
      originalLanguage: data.originalLanguage,
    });
    if (!response.data) {
      throw new Error('Failed to create story');
    }
    return response.data;
  }

  async deleteStory(storyId: string): Promise<void> {
    await apiService.delete(`/posts/${storyId}`);
  }

  async recordView(storyId: string): Promise<void> {
    await apiService.post(`/posts/${storyId}/view`);
  }

  async reactToStory(storyId: string, emoji: string): Promise<void> {
    await apiService.post(`/posts/${storyId}/like`, { emoji });
  }

  async removeReaction(storyId: string): Promise<void> {
    await apiService.delete(`/posts/${storyId}/like`);
  }

  async getViewers(storyId: string, limit = 20, offset = 0): Promise<StoryViewersResponse> {
    const response = await apiService.get<StoryViewersResponse>(
      `/posts/${storyId}/views`,
      { limit, offset }
    );
    return response.data ?? { viewers: [], total: 0 };
  }
}

export const storyService = new StoryService();
