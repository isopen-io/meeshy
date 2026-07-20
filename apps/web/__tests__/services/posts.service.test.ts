import { postsService, recordAnonymousView } from '@/services/posts.service';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `http://localhost:3000/api/v1${endpoint}`,
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

describe('postsService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ── Feed ──────────────────────────────────────────────────────────────

  describe('getFeed', () => {
    it('calls GET /posts/feed with no params by default', async () => {
      const innerResponse = { success: true, data: [], meta: { pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, nextCursor: null } };
      mockApi.get.mockResolvedValue({ success: true, data: innerResponse });

      const result = await postsService.getFeed();

      expect(mockApi.get).toHaveBeenCalledWith('/posts/feed');
      expect(result).toEqual(innerResponse);
    });

    it('passes cursor and limit as query params', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });

      await postsService.getFeed({ cursor: 'abc123', limit: 10 });

      expect(mockApi.get).toHaveBeenCalledWith('/posts/feed?cursor=abc123&limit=10');
    });
  });

  describe('getStories', () => {
    it('calls GET /posts/feed/stories', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });
      await postsService.getStories();
      expect(mockApi.get).toHaveBeenCalledWith('/posts/feed/stories');
    });
  });

  describe('getStatuses', () => {
    it('calls GET /posts/feed/statuses', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });
      await postsService.getStatuses();
      expect(mockApi.get).toHaveBeenCalledWith('/posts/feed/statuses');
    });
  });

  describe('getUserPosts', () => {
    it('calls GET /posts/user/:userId', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });
      await postsService.getUserPosts('user-123');
      expect(mockApi.get).toHaveBeenCalledWith('/posts/user/user-123');
    });
  });

  describe('getBookmarks', () => {
    it('calls GET /posts/bookmarks', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });
      await postsService.getBookmarks();
      expect(mockApi.get).toHaveBeenCalledWith('/posts/bookmarks');
    });
  });

  // ── Single Post ───────────────────────────────────────────────────────

  describe('getPost', () => {
    it('calls GET /posts/:postId', async () => {
      const innerResponse = { success: true, data: { id: 'post-1', content: 'Hello' } };
      mockApi.get.mockResolvedValue({ success: true, data: innerResponse });

      const result = await postsService.getPost('post-1');

      expect(mockApi.get).toHaveBeenCalledWith('/posts/post-1');
      expect(result).toEqual(innerResponse);
    });
  });

  // ── CRUD ──────────────────────────────────────────────────────────────

  describe('createPost', () => {
    it('calls POST /posts with body', async () => {
      const body = { content: 'New post', type: 'POST' as const, visibility: 'PUBLIC' as const };
      mockApi.post.mockResolvedValue({ success: true, data: { id: 'new-1', ...body } });

      await postsService.createPost(body);

      expect(mockApi.post).toHaveBeenCalledWith('/posts', body);
    });
  });

  describe('updatePost', () => {
    it('calls PUT /posts/:postId with body', async () => {
      mockApi.put.mockResolvedValue({ success: true });
      await postsService.updatePost('post-1', { content: 'Updated' });
      expect(mockApi.put).toHaveBeenCalledWith('/posts/post-1', { content: 'Updated' });
    });
  });

  describe('deletePost', () => {
    it('calls DELETE /posts/:postId', async () => {
      mockApi.delete.mockResolvedValue({ success: true, data: { deleted: true } });
      await postsService.deletePost('post-1');
      expect(mockApi.delete).toHaveBeenCalledWith('/posts/post-1');
    });
  });

  // ── Interactions ──────────────────────────────────────────────────────

  describe('likePost', () => {
    it('calls POST /posts/:postId/like with default emoji', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.likePost('post-1');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/like', { emoji: '❤️' });
    });

    it('calls POST /posts/:postId/like with custom emoji', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.likePost('post-1', '🔥');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/like', { emoji: '🔥' });
    });
  });

  describe('unlikePost', () => {
    it('calls DELETE /posts/:postId/like', async () => {
      mockApi.delete.mockResolvedValue({ success: true });
      await postsService.unlikePost('post-1');
      expect(mockApi.delete).toHaveBeenCalledWith('/posts/post-1/like');
    });
  });

  describe('bookmarkPost', () => {
    it('calls POST /posts/:postId/bookmark', async () => {
      mockApi.post.mockResolvedValue({ success: true, data: { bookmarked: true } });
      await postsService.bookmarkPost('post-1');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/bookmark');
    });
  });

  describe('unbookmarkPost', () => {
    it('calls DELETE /posts/:postId/bookmark', async () => {
      mockApi.delete.mockResolvedValue({ success: true, data: { bookmarked: false } });
      await postsService.unbookmarkPost('post-1');
      expect(mockApi.delete).toHaveBeenCalledWith('/posts/post-1/bookmark');
    });
  });

  describe('repost', () => {
    it('calls POST /posts/:postId/repost', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.repost('post-1', { content: 'My quote', isQuote: true });
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/repost', { content: 'My quote', isQuote: true });
    });
  });

  describe('sharePost', () => {
    it('calls POST /posts/:postId/share without platform', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.sharePost('post-1');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/share', undefined);
    });

    it('calls POST /posts/:postId/share with platform', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.sharePost('post-1', 'twitter');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/share', { platform: 'twitter' });
    });
  });

  describe('pinPost', () => {
    it('calls POST /posts/:postId/pin', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.pinPost('post-1');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/pin');
    });
  });

  describe('unpinPost', () => {
    it('calls DELETE /posts/:postId/pin', async () => {
      mockApi.delete.mockResolvedValue({ success: true });
      await postsService.unpinPost('post-1');
      expect(mockApi.delete).toHaveBeenCalledWith('/posts/post-1/pin');
    });
  });

  describe('viewPost', () => {
    it('calls POST /posts/:postId/view without duration', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.viewPost('post-1');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/view', undefined);
    });

    it('calls POST /posts/:postId/view with duration', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.viewPost('post-1', 5000);
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/view', { duration: 5000 });
    });
  });

  describe('translatePost', () => {
    it('calls POST /posts/:postId/translate', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.translatePost('post-1', 'en');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/translate', { targetLanguage: 'en' });
    });
  });

  // ── Impressions ───────────────────────────────────────────────────────

  describe('recordImpressions', () => {
    it('calls POST /posts/impressions/batch with ids and default source feed', async () => {
      mockApi.post.mockResolvedValue({ success: true, data: { recorded: 2 } });
      await postsService.recordImpressions(['p1', 'p2']);
      expect(mockApi.post).toHaveBeenCalledWith('/posts/impressions/batch', { postIds: ['p1', 'p2'], source: 'feed' });
    });

    it('forwards an explicit source', async () => {
      mockApi.post.mockResolvedValue({ success: true, data: { recorded: 1 } });
      await postsService.recordImpressions(['p1'], 'profile');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/impressions/batch', { postIds: ['p1'], source: 'profile' });
    });

    it('is a no-op when the id list is empty (never hits the network)', async () => {
      await postsService.recordImpressions([]);
      expect(mockApi.post).not.toHaveBeenCalled();
    });

    it('chunks ids past the 50-per-request server cap', async () => {
      mockApi.post.mockResolvedValue({ success: true, data: { recorded: 50 } });
      const ids = Array.from({ length: 120 }, (_, i) => `p${i}`);

      await postsService.recordImpressions(ids);

      expect(mockApi.post).toHaveBeenCalledTimes(3);
      expect(mockApi.post).toHaveBeenNthCalledWith(1, '/posts/impressions/batch', { postIds: ids.slice(0, 50), source: 'feed' });
      expect(mockApi.post).toHaveBeenNthCalledWith(2, '/posts/impressions/batch', { postIds: ids.slice(50, 100), source: 'feed' });
      expect(mockApi.post).toHaveBeenNthCalledWith(3, '/posts/impressions/batch', { postIds: ids.slice(100, 120), source: 'feed' });
    });
  });

  describe('recordImpression', () => {
    it('calls POST /posts/:postId/impression with default source detail', async () => {
      mockApi.post.mockResolvedValue({ success: true, data: { recorded: true } });
      await postsService.recordImpression('post-1');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/impression', { source: 'detail' });
    });

    it('forwards an explicit source', async () => {
      mockApi.post.mockResolvedValue({ success: true, data: { recorded: true } });
      await postsService.recordImpression('post-1', 'notification');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/impression', { source: 'notification' });
    });
  });

  // ── Comments ──────────────────────────────────────────────────────────

  describe('getComments', () => {
    it('calls GET /posts/:postId/comments', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });
      await postsService.getComments('post-1');
      expect(mockApi.get).toHaveBeenCalledWith('/posts/post-1/comments');
    });

    it('passes cursor pagination', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });
      await postsService.getComments('post-1', { cursor: 'xyz', limit: 10 });
      expect(mockApi.get).toHaveBeenCalledWith('/posts/post-1/comments?cursor=xyz&limit=10');
    });
  });

  describe('getCommentReplies', () => {
    it('calls GET /posts/:postId/comments/:commentId/replies', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });
      await postsService.getCommentReplies('post-1', 'comment-1');
      expect(mockApi.get).toHaveBeenCalledWith('/posts/post-1/comments/comment-1/replies');
    });
  });

  describe('createComment', () => {
    it('calls POST /posts/:postId/comments with content', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.createComment('post-1', 'Great post!');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/comments', { content: 'Great post!' });
    });

    it('includes parentId for replies', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.createComment('post-1', 'Reply!', 'parent-1');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/comments', { content: 'Reply!', parentId: 'parent-1' });
    });
  });

  describe('deleteComment', () => {
    it('calls DELETE /posts/:postId/comments/:commentId', async () => {
      mockApi.delete.mockResolvedValue({ success: true });
      await postsService.deleteComment('post-1', 'comment-1');
      expect(mockApi.delete).toHaveBeenCalledWith('/posts/post-1/comments/comment-1');
    });
  });

  describe('likeComment', () => {
    it('calls POST /posts/:postId/comments/:commentId/like', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      await postsService.likeComment('post-1', 'comment-1');
      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/comments/comment-1/like', { emoji: '❤️' });
    });
  });

  describe('unlikeComment', () => {
    it('calls DELETE /posts/:postId/comments/:commentId/like', async () => {
      mockApi.delete.mockResolvedValue({ success: true });
      await postsService.unlikeComment('post-1', 'comment-1');
      expect(mockApi.delete).toHaveBeenCalledWith('/posts/post-1/comments/comment-1/like');
    });
  });
});

// ── Gap-fill tests ────────────────────────────────────────────────────────────

describe('postsService gap-fill', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getStatusesDiscover', () => {
    it('calls GET /posts/feed/statuses/discover with no params by default', async () => {
      const innerResponse = {
        success: true,
        data: [],
        meta: { pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
      };
      mockApi.get.mockResolvedValue({ success: true, data: innerResponse });

      const result = await postsService.getStatusesDiscover();

      expect(mockApi.get).toHaveBeenCalledWith('/posts/feed/statuses/discover');
      expect(result).toEqual(innerResponse);
    });

    it('passes cursor and limit as query params', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });

      await postsService.getStatusesDiscover({ cursor: 'cur-xyz', limit: 5 });

      expect(mockApi.get).toHaveBeenCalledWith('/posts/feed/statuses/discover?cursor=cur-xyz&limit=5');
    });
  });

  describe('getCommunityPosts', () => {
    it('calls GET /posts/community/:communityId with no filters', async () => {
      const innerResponse = {
        success: true,
        data: [],
        meta: { pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
      };
      mockApi.get.mockResolvedValue({ success: true, data: innerResponse });

      const result = await postsService.getCommunityPosts('community-1');

      expect(mockApi.get).toHaveBeenCalledWith('/posts/community/community-1');
      expect(result).toEqual(innerResponse);
    });

    it('passes cursor and limit as query params', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });

      await postsService.getCommunityPosts('community-1', { cursor: 'ccc', limit: 15 });

      expect(mockApi.get).toHaveBeenCalledWith('/posts/community/community-1?cursor=ccc&limit=15');
    });
  });

  describe('getPostViews', () => {
    it('calls GET /posts/:postId/views with default limit and offset', async () => {
      const innerResponse = {
        items: [],
        pagination: { total: 0, offset: 0, limit: 50, hasMore: false },
      };
      mockApi.get.mockResolvedValue({ success: true, data: innerResponse });

      const result = await postsService.getPostViews('post-1');

      expect(mockApi.get).toHaveBeenCalledWith('/posts/post-1/views?limit=50&offset=0');
      expect(result).toEqual(innerResponse);
    });

    it('calls GET /posts/:postId/views with custom limit and offset', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: { items: [], pagination: { total: 0, offset: 10, limit: 25, hasMore: false } } });

      await postsService.getPostViews('post-2', 25, 10);

      expect(mockApi.get).toHaveBeenCalledWith('/posts/post-2/views?limit=25&offset=10');
    });
  });

  describe('getStoryAudioLibrary', () => {
    it('calls GET /stories/audio with default limit and no query', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });

      await postsService.getStoryAudioLibrary();

      expect(mockApi.get).toHaveBeenCalledWith('/stories/audio?limit=20');
    });

    it('includes q param when query is provided', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });

      await postsService.getStoryAudioLibrary('chill');

      expect(mockApi.get).toHaveBeenCalledWith('/stories/audio?q=chill&limit=20');
    });

    it('uses custom limit when provided', async () => {
      mockApi.get.mockResolvedValue({ success: true, data: [] });

      await postsService.getStoryAudioLibrary(undefined, 50);

      expect(mockApi.get).toHaveBeenCalledWith('/stories/audio?limit=50');
    });
  });

  describe('trackStoryAudioUse', () => {
    it('calls POST /stories/audio/:audioId/use', async () => {
      mockApi.post.mockResolvedValue({ success: true });

      await postsService.trackStoryAudioUse('audio-123');

      expect(mockApi.post).toHaveBeenCalledWith('/stories/audio/audio-123/use');
    });
  });

  describe('repost with default empty body', () => {
    it('calls POST /posts/:postId/repost with empty body by default', async () => {
      mockApi.post.mockResolvedValue({ success: true });

      await postsService.repost('post-1');

      expect(mockApi.post).toHaveBeenCalledWith('/posts/post-1/repost', {});
    });
  });
});

// ── recordAnonymousView ───────────────────────────────────────────────────────

describe('recordAnonymousView', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fires a POST fetch to the anonymous-view endpoint', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    await recordAnonymousView('post-abc', 'session-key-123');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/posts/post-abc/anonymous-view',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-session-token': 'session-key-123',
        }),
      }),
    );
  });

  it('does not throw when fetch rejects (fire-and-forget)', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network failure'));
    global.fetch = mockFetch;

    // Should resolve without throwing
    await expect(recordAnonymousView('post-abc', 'session-key-123')).resolves.toBeUndefined();
  });
});
