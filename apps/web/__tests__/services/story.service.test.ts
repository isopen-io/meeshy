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

// F5 correction — `createStory` resolves `originalLanguage` from the active
// UI locale (never `usePreferredLanguage()`'s READ language, a caller
// concern) when the caller doesn't already provide one.
const mockGetCurrentInterfaceLocale = jest.fn();
jest.mock('@/stores/language-store', () => ({
  getCurrentInterfaceLocale: () => mockGetCurrentInterfaceLocale(),
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
    function page(stories: Post[], pagination?: { hasMore: boolean; nextCursor?: string | null }) {
      return { success: true, data: { success: true, data: stories, pagination } };
    }

    it('returns the data array from the response', async () => {
      const story = makePost();
      mockApi.get.mockResolvedValue(page([story], { hasMore: false }));

      const result = await storyService.getStories();

      expect(mockApi.get).toHaveBeenCalledWith('/posts/feed/stories', { limit: 50, cursor: undefined });
      expect(result).toEqual([story]);
    });

    it('returns empty array when response data is null', async () => {
      // response.data is null → response.data?.data is undefined → ?? []
      mockApi.get.mockResolvedValue({ success: true, data: null });

      const result = await storyService.getStories();

      expect(result).toEqual([]);
      expect(mockApi.get).toHaveBeenCalledTimes(1);
    });

    // La route plafonne `limit` à 50 et annonce la suite par
    // `pagination.hasMore`/`nextCursor`. Sans drain, le tray web restait coupé à
    // 50 stories — même défaut qu'iOS avant le cycle 80, pour la même raison.
    it('drains the following pages while hasMore, chaining nextCursor', async () => {
      mockApi.get
        .mockResolvedValueOnce(page([makePost({ id: 's1' })], { hasMore: true, nextCursor: 'c1' }))
        .mockResolvedValueOnce(page([makePost({ id: 's2' })], { hasMore: true, nextCursor: 'c2' }))
        .mockResolvedValueOnce(page([makePost({ id: 's3' })], { hasMore: false }));

      const result = await storyService.getStories();

      expect(result.map(s => s.id)).toEqual(['s1', 's2', 's3']);
      expect(mockApi.get).toHaveBeenNthCalledWith(1, '/posts/feed/stories', { limit: 50, cursor: undefined });
      expect(mockApi.get).toHaveBeenNthCalledWith(2, '/posts/feed/stories', { limit: 50, cursor: 'c1' });
      expect(mockApi.get).toHaveBeenNthCalledWith(3, '/posts/feed/stories', { limit: 50, cursor: 'c2' });
    });

    // Un serveur qui annonce `hasMore` sans fin ne doit pas faire boucler le
    // client indéfiniment (même borne que le drain iOS).
    it('stops at the page cap even when the server keeps saying hasMore', async () => {
      mockApi.get.mockResolvedValue(page([makePost()], { hasMore: true, nextCursor: 'always-more' }));

      const result = await storyService.getStories();

      expect(mockApi.get).toHaveBeenCalledTimes(6);
      expect(result).toHaveLength(6);
    });

    // `hasMore: true` sans curseur est une page suivante qu'on ne sait pas
    // demander : boucler dessus rejouerait la même page (cycle 80, D2).
    it('stops when hasMore carries no cursor', async () => {
      mockApi.get.mockResolvedValue(page([makePost()], { hasMore: true, nextCursor: null }));

      const result = await storyService.getStories();

      expect(mockApi.get).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('stops when hasMore carries an empty cursor', async () => {
      mockApi.get.mockResolvedValue(page([makePost()], { hasMore: true, nextCursor: '' }));

      await storyService.getStories();

      expect(mockApi.get).toHaveBeenCalledTimes(1);
    });

    // Rétro-compat : une réponse sans bloc `pagination` est une page unique.
    it('treats a response without a pagination block as a single page', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: { success: true, data: [makePost()] } });

      const result = await storyService.getStories();

      expect(mockApi.get).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });
  });

  // ── createStory ────────────────────────────────────────────────────────────

  describe('createStory', () => {
    it('creates a story with minimum fields and defaults visibility to PUBLIC', async () => {
      const story = makePost();
      mockApi.post.mockResolvedValue({ success: true, data: story });

      const result = await storyService.createStory({ content: 'My story' });

      expect(mockApi.post).toHaveBeenCalledWith(
        '/posts',
        expect.objectContaining({
          type: 'STORY',
          content: 'My story',
          visibility: 'PUBLIC',
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

    // F7d correction (constat 20, arbitrage 8) — une story qui PORTE du
    // texte laisse le champ absent : le serveur détecte la langue depuis le
    // contenu lui-même (`detectLanguage`), plus fiable que la locale
    // d'interface de l'auteur.
    it('does not resolve originalLanguage from the UI locale when the story carries text - server text detection wins', async () => {
      mockGetCurrentInterfaceLocale.mockReturnValue('es');
      mockApi.post.mockResolvedValue({ success: true, data: makePost() });

      await storyService.createStory({
        content: 'Story',
        storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
      });

      const [, body] = mockApi.post.mock.calls[0];
      expect(body).not.toHaveProperty('originalLanguage');
    });

    // F5 correction — `originalLanguage` used to be whatever the caller
    // handed in verbatim (`PostsFeedScreen.handleStoryPublish` was passing
    // the reader's READ language). The real point of publication now
    // resolves it itself, from the active UI locale, exactly like
    // `postsService.createPost` already does for other `storyEffects`
    // creates — the two funnels share one resolver. Only reached for a
    // story WITHOUT text (constat 20) — a media-only story here.
    it('resolves originalLanguage from the active UI locale for a text-less story', async () => {
      mockGetCurrentInterfaceLocale.mockReturnValue('es');
      mockApi.post.mockResolvedValue({ success: true, data: makePost() });

      await storyService.createStory({
        storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
      });

      expect(mockApi.post).toHaveBeenCalledWith(
        '/posts',
        expect.objectContaining({ originalLanguage: 'es' }),
      );
    });

    it('keeps a caller-provided originalLanguage untouched (e.g. audio transcription language)', async () => {
      mockGetCurrentInterfaceLocale.mockReturnValue('es');
      mockApi.post.mockResolvedValue({ success: true, data: makePost() });

      await storyService.createStory({
        content: 'Story',
        storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
        originalLanguage: 'ja',
      });

      expect(mockApi.post).toHaveBeenCalledWith(
        '/posts',
        expect.objectContaining({ originalLanguage: 'ja' }),
      );
    });

    it('omits originalLanguage when the active UI locale is unknown — never a guessed language', async () => {
      mockGetCurrentInterfaceLocale.mockReturnValue('');
      mockApi.post.mockResolvedValue({ success: true, data: makePost() });

      await storyService.createStory({
        storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
      });

      const [, body] = mockApi.post.mock.calls[0];
      expect(body).not.toHaveProperty('originalLanguage');
    });

    // `createStory` hand-picks the fields it forwards to `apiService.post` —
    // same class of bug as the other optional fields above, but `mentions`
    // was missing entirely (plan post-references-web, Task 5).
    it('passes mentions when provided', async () => {
      const story = makePost();
      mockApi.post.mockResolvedValue({ success: true, data: story });

      await storyService.createStory({
        content: 'Soirée avec elle',
        mentions: [{ userId: 'u-a', display: 'SILENT' }],
      });

      expect(mockApi.post).toHaveBeenCalledWith(
        '/posts',
        expect.objectContaining({ mentions: [{ userId: 'u-a', display: 'SILENT' }] }),
      );
    });

    it('omits mentions when not provided (tri-state, never [])', async () => {
      const story = makePost();
      mockApi.post.mockResolvedValue({ success: true, data: story });

      await storyService.createStory({ content: 'No one referenced' });

      const [, body] = mockApi.post.mock.calls[0];
      expect(body).not.toHaveProperty('mentions');
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
