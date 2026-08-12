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

/**
 * `GET /posts/feed/stories` plafonne `limit` à 50 côté serveur
 * (`Math.min(Math.max(limit, 1), 50)`) et annonce la suite par
 * `pagination.hasMore` / `pagination.nextCursor`. Les deux bornes ci-dessous
 * sont tenues À LA MAIN face à ce plafond — rien de mécanique ne les lie, même
 * dette jumelle que `trayPageLimit`/`maxTrayPagesPerPass` côté iOS.
 */
const STORY_TRAY_PAGE_LIMIT = 50;
const STORY_TRAY_MAX_PAGES_PER_PASS = 6;

type StoryPage = {
  readonly success: boolean;
  readonly data: Post[];
  readonly pagination?: { readonly hasMore?: boolean; readonly nextCursor?: string | null };
};

class StoryService {
  /**
   * Drain du tray : la première page ne dit pas tout, et son `hasMore` est
   * exact (la fenêtre est filtrée par `updatedAt` mais le curseur porte sur le
   * couple `(createdAt, id)` de l'ordre — le parcours ne saute ni ne double).
   *
   * Deux arrêts, tous deux nécessaires : le plafond de pages protège contre un
   * serveur qui annoncerait `hasMore` sans fin, et un `hasMore` sans curseur
   * s'arrête au lieu de rejouer la même page indéfiniment.
   */
  async getStories(): Promise<Post[]> {
    const stories: Post[] = [];
    let cursor: string | undefined;

    for (let pageIndex = 0; pageIndex < STORY_TRAY_MAX_PAGES_PER_PASS; pageIndex += 1) {
      const response = await apiService.get<StoryPage>('/posts/feed/stories', {
        limit: STORY_TRAY_PAGE_LIMIT,
        cursor,
      });
      const page = response.data;
      stories.push(...(page?.data ?? []));

      const nextCursor = page?.pagination?.nextCursor;
      if (!page?.pagination?.hasMore || !nextCursor) break;
      cursor = nextCursor;
    }

    return stories;
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
