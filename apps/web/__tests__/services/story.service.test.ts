import { storyService } from '@/services/story.service';
import { apiService } from '@/services/api.service';
import type { Post } from '@meeshy/shared/types/post';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'story-1',
    authorId: 'user-1',
    type: 'STORY',
    visibility: 'FRIENDS',
    content: 'My story',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('storyService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ── getStories ─────────────────────────────────────────────────────────────

  describe('getStories', () => {
    it('returns the data array from the response', async () => {
      const story = makePost();
      mockApi.get.mockResolvedValue({
        success: true,
        data: { success: true, data: [story] },
      });

      const result = await storyService.getStories();

      expect(mockApi.get).toHaveBeenCalledWith('/posts/feed/stories');
      expect(result).toEqual([story]);
    });

    it('returns empty array when response data is null', async () => {
      // response.data is null → response.data?.data is undefined → ?? []
      mockApi.get.mockResolvedValue({ success: true, data: null });

      const result = await storyService.getStories();

      expect(result).toEqual([]);
    });
  });

  // ── createStory ────────────────────────────────────────────────────────────

  describe('createStory', () => {
    it('creates a story with minimum fields and defaults visibility to FRIENDS', async () => {
      const story = makePost();
      mockApi.post.mockResolvedValue({ success: true, data: story });

      const result = await storyService.createStory({ content: 'My story' });

      expect(mockApi.post).toHaveBeenCalledWith(
        '/posts',
        expect.objectContaining({
          type: 'STORY',
          content: 'My story',
          visibility: 'FRIENDS',
        }),
      );
      expect(result).toEqual(story);
    });

    it('passes all optional fields when provided', async () => {
      const story = makePost({ visibility: 'PUBLIC' });
      mockApi.post.mockResolvedValue({ success: true, data: story });

      await storyService.createStory({
        content: 'Story with all fields',
        visibility: 'PUBLIC',
        visibilityUserIds: ['user-2'],
        storyEffects: { filter: 'warm' },
        mediaIds: ['media-1'],
        originalLanguage: 'fr',
      });

      expect(mockApi.post).toHaveBeenCalledWith(
        '/posts',
        expect.objectContaining({
          type: 'STORY',
          visibility: 'PUBLIC',
          visibilityUserIds: ['user-2'],
          storyEffects: { filter: 'warm' },
          mediaIds: ['media-1'],
          originalLanguage: 'fr',
        }),
      );
    });

    it('throws when response data is null', async () => {
      mockApi.post.mockResolvedValue({ success: true, data: null });

      await expect(storyService.createStory({ content: 'Story' })).rejects.toThrow(
        'Failed to create story',
      );
    });
  });

  // ── deleteStory ────────────────────────────────────────────────────────────

  describe('deleteStory', () => {
    it('calls DELETE /posts/:storyId', async () => {
      mockApi.delete.mockResolvedValue({ success: true });

      await storyService.deleteStory('story-1');

      expect(mockApi.delete).toHaveBeenCalledWith('/posts/story-1');
    });
  });

  // ── recordView ─────────────────────────────────────────────────────────────

  describe('recordView', () => {
    it('calls POST /posts/:storyId/view', async () => {
      mockApi.post.mockResolvedValue({ success: true });

      await storyService.recordView('story-1');

      expect(mockApi.post).toHaveBeenCalledWith('/posts/story-1/view');
    });
  });

  // ── reactToStory ───────────────────────────────────────────────────────────

  describe('reactToStory', () => {
    it('calls POST /posts/:storyId/like with emoji', async () => {
      mockApi.post.mockResolvedValue({ success: true });

      await storyService.reactToStory('story-1', '🔥');

      expect(mockApi.post).toHaveBeenCalledWith('/posts/story-1/like', { emoji: '🔥' });
    });
  });

  // ── removeReaction ─────────────────────────────────────────────────────────

  describe('removeReaction', () => {
    it('calls DELETE /posts/:storyId/like', async () => {
      mockApi.delete.mockResolvedValue({ success: true });

      await storyService.removeReaction('story-1');

      expect(mockApi.delete).toHaveBeenCalledWith('/posts/story-1/like');
    });
  });

  // ── getViewers ─────────────────────────────────────────────────────────────

  describe('getViewers', () => {
    it('returns viewers data from response', async () => {
      const viewersResponse = { viewers: [{ userId: 'user-2', viewedAt: '2026-01-01T00:00:00Z' }], total: 1 };
      mockApi.get.mockResolvedValue({ success: true, data: viewersResponse });

      const result = await storyService.getViewers('story-1');

      expect(mockApi.get).toHaveBeenCalledWith('/posts/story-1/views', { limit: 20, offset: 0 });
      expect(result).toEqual(viewersResponse);
    });

    it('returns fallback when response data is null', async () => {
      // response.data is null → ?? { viewers: [], total: 0 }
      mockApi.get.mockResolvedValue({ success: true, data: null });

      const result = await storyService.getViewers('story-1');

      expect(result).toEqual({ viewers: [], total: 0 });
    });

    it('passes custom limit and offset', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: { viewers: [], total: 0 } });

      await storyService.getViewers('story-1', 10, 5);

      expect(mockApi.get).toHaveBeenCalledWith('/posts/story-1/views', { limit: 10, offset: 5 });
    });
  });
});
