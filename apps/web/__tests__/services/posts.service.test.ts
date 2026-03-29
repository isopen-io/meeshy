import { postsService } from '@/services/posts.service';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
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
