import { apiService } from './api.service';
import { resolveOriginalLanguageForCreate } from './posts.service';
import { DEFAULT_PUBLICATION_VISIBILITY } from '@meeshy/shared/types/post';
import type { Post, PostVisibility, PostView } from '@meeshy/shared/types/post';
import type { ApiResponse } from '@meeshy/shared/types';
import type { PostReferenceInput } from '@meeshy/shared/types/post-reference';

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
  /** Declared, non-INLINE references only — absent (not `[]`) when not touched (tri-state). */
  readonly mentions?: readonly PostReferenceInput[];
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
    // F5 correction — resolve `originalLanguage` here, at the real point of
    // publication, instead of trusting whatever the caller passed through:
    // `PostsFeedScreen.handleStoryPublish` used to force the reader's
    // preferred (READ) language onto it. Same funnel as
    // `postsService.createPost` — a caller-supplied value (e.g. an audio
    // transcription language) still wins. Left absent (not sent as
    // `undefined`) when unresolved, so server detection stays the fallback.
    const originalLanguage = resolveOriginalLanguageForCreate(data);
    const response = await apiService.post<Post>('/posts', {
      type: 'STORY' as const,
      content: data.content,
      visibility: data.visibility ?? DEFAULT_PUBLICATION_VISIBILITY,
      visibilityUserIds: data.visibilityUserIds,
      storyEffects: data.storyEffects,
      mediaIds: data.mediaIds,
      ...(originalLanguage ? { originalLanguage } : {}),
      ...(data.mentions ? { mentions: data.mentions } : {}),
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
