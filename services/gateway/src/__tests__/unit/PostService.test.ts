/**
 * @jest-environment node
 *
 * Unit tests for PostService and PostCommentService.
 *
 * All Prisma calls are mocked — these tests verify service logic
 * (authorization guards, reaction accounting, counter updates)
 * without touching the database.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { PostCommentService } from '../../services/PostCommentService';
import { MediaService } from '../../services/MediaService';
import type { PostReactionService } from '../../services/PostReactionService';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';

// PostAudioService uses a singleton that requires initialization — mock it entirely
// so PostService tests don't depend on ZMQ / SocialEventsHandler setup.
jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: {
      processPostAudio: jest.fn().mockReturnValue(Promise.resolve()),
    },
    init: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockPrisma() {
  const prisma: any = {
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    postComment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    commentReaction: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
    },
    postBookmark: {
      upsert: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    postView: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    postMedia: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    participant: {
      findMany: jest.fn(),
    },
    postReaction: {
      findMany: jest.fn(),
    },
    friendRequest: {
      findMany: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return prisma;
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    authorId: 'user-author',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello world',
    reactions: [],
    reactionSummary: {},
    reactionCount: 0,
    likeCount: 0,
    commentCount: 5,
    shareCount: 0,
    repostCount: 0,
    isPinned: false,
    deletedAt: null,
    ...overrides,
  };
}

function createMockPostReactionService() {
  return {
    addReaction: jest.fn<PostReactionService['addReaction']>().mockResolvedValue({ id: 'rxn-1', postId: 'post-1', userId: 'user-liker', emoji: '❤️', createdAt: new Date(), updatedAt: new Date() }),
    removeReaction: jest.fn<PostReactionService['removeReaction']>().mockResolvedValue(true),
  } as unknown as PostReactionService;
}

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment-1',
    postId: 'post-1',
    authorId: 'user-commenter',
    content: 'Nice post!',
    parentId: null,
    likeCount: 3,
    replyCount: 0,
    reactionSummary: {},
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PostService
// ---------------------------------------------------------------------------

describe('PostService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let mediaService: MediaService;
  let mockReactionService: PostReactionService;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    mediaService = new MediaService();
    mockReactionService = createMockPostReactionService();
    service = new PostService(prisma, mediaService, undefined, mockReactionService);
  });

  // -----------------------------------------------------------------------
  // createPost
  // -----------------------------------------------------------------------

  describe('createPost', () => {
    const basePostData = {
      type: PostType.POST,
      visibility: PostVisibility.PUBLIC,
    };

    it('creates a post and links mediaIds without mobileTranscription', async () => {
      const post = makePost();
      prisma.post.create.mockResolvedValue(post);
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost({ ...basePostData, mediaIds: ['media-1', 'media-2'] }, 'user-1');

      expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['media-1', 'media-2'] } },
        data: { postId: 'post-1' },
      });
      // findFirst is called to detect audio media for Whisper processing
      expect(prisma.postMedia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['media-1', 'media-2'] }, mimeType: { startsWith: 'audio/' } },
        }),
      );
      // No audio media found — update is not called
      expect(prisma.postMedia.update).not.toHaveBeenCalled();
    });

    it('does not query postMedia when no mediaIds are provided', async () => {
      prisma.post.create.mockResolvedValue(makePost());

      await service.createPost(basePostData, 'user-1');

      expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
      expect(prisma.postMedia.findFirst).not.toHaveBeenCalled();
    });

    it('saves mobileTranscription in the first audio PostMedia when provided', async () => {
      const post = makePost();
      prisma.post.create.mockResolvedValue(post);
      prisma.postMedia.findFirst.mockResolvedValue({ id: 'media-audio', fileUrl: '/uploads/audio.m4a' });
      prisma.postMedia.update.mockResolvedValue({});

      const mobileTranscription = {
        text: 'Hello world',
        language: 'en',
        confidence: 0.95,
        duration_ms: 3000,
        segments: [],
      };

      await service.createPost(
        { ...basePostData, mediaIds: ['media-audio', 'media-img'], mobileTranscription },
        'user-1',
      );

      expect(prisma.postMedia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['media-audio', 'media-img'] }, mimeType: { startsWith: 'audio/' } },
          select: { id: true, fileUrl: true },
        }),
      );

      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'media-audio' },
        data: {
          transcription: {
            text: 'Hello world',
            language: 'en',
            confidence: 0.95,
            duration_ms: 3000,
            segments: [],
            source: 'mobile',
          },
        },
      });
    });

    it('does not update postMedia transcription when no audio PostMedia is found', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      const mobileTranscription = { text: 'Hello', language: 'en', segments: [] };

      await service.createPost(
        { ...basePostData, mediaIds: ['media-img'], mobileTranscription },
        'user-1',
      );

      expect(prisma.postMedia.findFirst).toHaveBeenCalled();
      expect(prisma.postMedia.update).not.toHaveBeenCalled();
    });

    it('always looks for audio PostMedia when mediaIds present to enable Whisper processing', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        { ...basePostData, mediaIds: ['media-img'] },
        'user-1',
      );

      // findFirst is always called to detect audio media (for Whisper fire-and-forget)
      expect(prisma.postMedia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['media-img'] }, mimeType: { startsWith: 'audio/' } },
        }),
      );
      // No audio media → no transcription update
      expect(prisma.postMedia.update).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // createPost with repostOfId
  // -----------------------------------------------------------------------

  describe('createPost with repostOfId', () => {
    it('calculates originalRepostOfId from repostOfId', async () => {
      const original = makePost({ id: 'orig-1', repostOfId: null, originalRepostOfId: null });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'new-1', ...args.data }));

      await service.createPost({
        type: PostType.STORY,
        visibility: PostVisibility.PUBLIC,
        content: 'hi',
        repostOfId: 'orig-1',
      }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.repostOfId).toBe('orig-1');
      expect(createCall.data.originalRepostOfId).toBe('orig-1');
    });

    it('flattens originalRepostOfId when chained', async () => {
      const intermediate = makePost({ id: 'inter-1', repostOfId: 'root-1', originalRepostOfId: 'root-1' });
      prisma.post.findFirst.mockResolvedValue(intermediate);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'new-2', ...args.data }));

      await service.createPost({
        type: PostType.STORY,
        visibility: PostVisibility.PUBLIC,
        repostOfId: 'inter-1',
      }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.originalRepostOfId).toBe('root-1');
    });

    it('does not set repost fields when repostOfId is omitted', async () => {
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'new-3', ...args.data }));

      await service.createPost({
        type: PostType.POST,
        visibility: PostVisibility.PUBLIC,
        content: 'normal post',
      }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.repostOfId).toBeUndefined();
      expect(createCall.data.originalRepostOfId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // likePost
  // -----------------------------------------------------------------------

  describe('likePost', () => {
    it('returns null when addReaction throws "not found"', async () => {
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockRejectedValue(new Error('Post not found'));

      const result = await service.likePost('000000000000000000000001', 'user-1');
      expect(result).toBeNull();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('delegates to addReaction and syncs Json mirror with 1 entry', async () => {
      const createdAt = new Date('2025-01-01T00:00:00Z');
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockResolvedValue({ id: 'rxn-1', postId: 'post-1', userId: 'user-liker', emoji: '🔥', createdAt, updatedAt: createdAt });

      const post = makePost({ likeCount: 1, reactionCount: 1 });
      // findFirst: first call returns post for Json rebuild, second call returns enriched post
      prisma.post.findFirst
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce(post);
      prisma.postReaction.findMany.mockResolvedValue([
        { userId: 'user-liker', emoji: '🔥', createdAt },
      ]);
      prisma.post.update.mockResolvedValue(post);

      const result = await service.likePost('post-1', 'user-liker', '🔥');

      expect(mockReactionService.addReaction).toHaveBeenCalledWith({
        postId: 'post-1',
        userId: 'user-liker',
        emoji: '🔥',
      });
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: expect.objectContaining({
            reactions: [{ userId: 'user-liker', emoji: '🔥', createdAt: createdAt.toISOString() }],
            likeCount: 1,
          }),
        }),
      );
      expect(result).toEqual(post);
    });

    it('is idempotent — addReaction returns existing reaction, Json shows 1 entry (no duplication)', async () => {
      const createdAt = new Date('2025-01-01T00:00:00Z');
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockResolvedValue({ id: 'rxn-1', postId: 'post-1', userId: 'user-liker', emoji: '❤️', createdAt, updatedAt: createdAt });

      const post = makePost({ likeCount: 1, reactions: [{ userId: 'user-liker', emoji: '❤️', createdAt: createdAt.toISOString() }] });
      prisma.post.findFirst
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce(post);
      prisma.postReaction.findMany.mockResolvedValue([
        { userId: 'user-liker', emoji: '❤️', createdAt },
      ]);
      prisma.post.update.mockResolvedValue(post);

      const result = await service.likePost('post-1', 'user-liker');

      expect(mockReactionService.addReaction).toHaveBeenCalledTimes(1);
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reactions: [{ userId: 'user-liker', emoji: '❤️', createdAt: createdAt.toISOString() }],
            likeCount: 1,
          }),
        }),
      );
      expect(result).toEqual(post);
    });

    it('returns null and skips Json update when post is deleted (addReaction throws "deleted")', async () => {
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockRejectedValue(new Error('Post has been deleted'));

      const result = await service.likePost('000000000000000000000001', 'user-1');
      expect(result).toBeNull();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('propagates unexpected errors from addReaction', async () => {
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockRejectedValue(new Error('DB connection lost'));

      await expect(service.likePost('post-1', 'user-1')).rejects.toThrow('DB connection lost');
    });
  });

  // -----------------------------------------------------------------------
  // unlikePost
  // -----------------------------------------------------------------------

  describe('unlikePost', () => {
    it('returns null when the post does not exist (findFirst before removeReaction)', async () => {
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.unlikePost('000000000000000000000001', 'user-1');
      expect(result).toBeNull();
    });

    it('removes the reaction and syncs Json mirror with 0 entries', async () => {
      (mockReactionService.removeReaction as ReturnType<typeof jest.fn>).mockResolvedValue(true);

      const post = makePost({ likeCount: 0 });
      prisma.post.findFirst
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce(post);
      prisma.postReaction.findMany
        // First call: fetch user's existing reaction to find emoji
        .mockResolvedValueOnce([{ userId: 'user-liker', emoji: '❤️', createdAt: new Date() }])
        // Second call: after removeReaction, rebuild Json mirror (0 rows)
        .mockResolvedValueOnce([]);
      prisma.post.update.mockResolvedValue(post);

      const result = await service.unlikePost('post-1', 'user-liker');

      expect(mockReactionService.removeReaction).toHaveBeenCalledWith({
        postId: 'post-1',
        userId: 'user-liker',
        emoji: '❤️',
      });
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: expect.objectContaining({
            reactions: [],
            likeCount: 0,
          }),
        }),
      );
      expect(result).toEqual(post);
    });

    it('is idempotent — no reaction exists, returns post unchanged without calling removeReaction', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.postReaction.findMany.mockResolvedValue([]);

      const result = await service.unlikePost('post-1', 'user-1');

      expect(mockReactionService.removeReaction).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
      expect(result).toEqual(post);
    });
  });

  // -----------------------------------------------------------------------
  // sharePost
  // -----------------------------------------------------------------------

  describe('sharePost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.sharePost('missing', 'user-1');
      expect(result).toBeNull();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('increments shareCount for an existing post', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());
      const updatedPost = makePost({ shareCount: 1 });
      prisma.post.update.mockResolvedValue(updatedPost);

      const result = await service.sharePost('post-1', 'user-1', 'twitter');

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { shareCount: { increment: 1 } },
        }),
      );
      expect(result).toEqual(updatedPost);
    });
  });

  // -----------------------------------------------------------------------
  // pinPost
  // -----------------------------------------------------------------------

  describe('pinPost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.pinPost('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }));

      await expect(service.pinPost('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('sets isPinned to true for the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));
      const pinnedPost = makePost({ isPinned: true });
      prisma.post.update.mockResolvedValue(pinnedPost);

      const result = await service.pinPost('post-1', 'user-1');

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { isPinned: true },
        }),
      );
      expect(result).toEqual(pinnedPost);
    });
  });

  // -----------------------------------------------------------------------
  // unpinPost
  // -----------------------------------------------------------------------

  describe('unpinPost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.unpinPost('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }));

      await expect(service.unpinPost('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('sets isPinned to false for the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', isPinned: true }));
      const unpinnedPost = makePost({ isPinned: false });
      prisma.post.update.mockResolvedValue(unpinnedPost);

      const result = await service.unpinPost('post-1', 'user-1');

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { isPinned: false },
        }),
      );
      expect(result).toEqual(unpinnedPost);
    });
  });

  // -----------------------------------------------------------------------
  // getPostViews
  // -----------------------------------------------------------------------

  describe('getPostViews', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.getPostViews('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }));

      await expect(service.getPostViews('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
    });

    it('returns paginated views with hasMore=true when more items exist', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));

      const viewItems = [
        { id: 'v1', userId: 'u1', postId: 'post-1', viewedAt: new Date() },
        { id: 'v2', userId: 'u2', postId: 'post-1', viewedAt: new Date() },
      ];
      prisma.postView.findMany.mockResolvedValue(viewItems);
      prisma.postView.count.mockResolvedValue(10);

      const result = await service.getPostViews('post-1', 'user-1', 2, 0);

      expect(result).toEqual({
        items: viewItems,
        total: 10,
        hasMore: true,
      });
    });

    it('returns hasMore=false when all items are fetched', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));
      prisma.postView.findMany.mockResolvedValue([
        { id: 'v1', userId: 'u1', postId: 'post-1', viewedAt: new Date() },
      ]);
      prisma.postView.count.mockResolvedValue(1);

      const result = await service.getPostViews('post-1', 'user-1', 50, 0);

      expect(result).toEqual({
        items: expect.any(Array),
        total: 1,
        hasMore: false,
      });
    });

    it('uses default limit and offset values', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));
      prisma.postView.findMany.mockResolvedValue([]);
      prisma.postView.count.mockResolvedValue(0);

      await service.getPostViews('post-1', 'user-1');

      expect(prisma.postView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // repostPost
  // -----------------------------------------------------------------------

  describe('repostPost', () => {
    it('returns null when the original post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.repostPost('missing', 'user-1');
      expect(result).toBeNull();
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('creates a repost linked to the original and increments repostCount', async () => {
      const original = makePost({ id: 'original-1', visibility: 'PUBLIC' });
      prisma.post.findFirst.mockResolvedValue(original);

      const repost = makePost({ id: 'repost-1', repostOfId: 'original-1', authorId: 'user-reposter' });
      prisma.post.create.mockResolvedValue(repost);
      prisma.post.update.mockResolvedValue(original);

      const result = await service.repostPost('original-1', 'user-reposter');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authorId: 'user-reposter',
            type: 'POST',
            visibility: 'PUBLIC',
            repostOfId: 'original-1',
            isQuote: false,
          }),
        }),
      );

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'original-1' },
          data: { repostCount: { increment: 1 } },
        }),
      );
      expect(result).toEqual(repost);
    });

    it('creates a quote repost with content', async () => {
      const original = makePost({ id: 'original-1', visibility: 'PUBLIC' });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost());
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('original-1', 'user-reposter', { content: 'Great post!', isQuote: true });

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: 'Great post!',
            isQuote: true,
            visibility: 'PUBLIC',
          }),
        }),
      );
    });

    it('sets originalRepostOfId to original.id when original is a root post', async () => {
      const original = makePost({ id: 'original-1', repostOfId: null, originalRepostOfId: null });
      prisma.post.findFirst.mockResolvedValue(original);
      const repost = makePost({ id: 'repost-1', repostOfId: 'original-1', originalRepostOfId: 'original-1' });
      prisma.post.create.mockResolvedValue(repost);
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('original-1', 'user-reposter');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            repostOfId: 'original-1',
            originalRepostOfId: 'original-1',
          }),
        })
      );
    });

    it('flattens originalRepostOfId when original is itself a repost', async () => {
      const original = makePost({
        id: 'intermediate-1',
        repostOfId: 'root-1',
        originalRepostOfId: 'root-1',
      });
      prisma.post.findFirst.mockResolvedValue(original);
      const repost = makePost({ id: 'repost-2', repostOfId: 'intermediate-1' });
      prisma.post.create.mockResolvedValue(repost);
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('intermediate-1', 'user-reposter');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            repostOfId: 'intermediate-1',
            originalRepostOfId: 'root-1',
          }),
        })
      );
    });

    it('accepts targetType option to override default repost type', async () => {
      const original = makePost({ id: 'story-1', type: PostType.STORY });
      prisma.post.findFirst.mockResolvedValue(original);
      const repost = makePost({ id: 'repost-3', repostOfId: 'story-1', type: PostType.STORY });
      prisma.post.create.mockResolvedValue(repost);
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('story-1', 'user-reposter', { targetType: PostType.STORY });

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: PostType.STORY,
          }),
        })
      );
    });

    it('rolls back media snapshot if a duplication fails partway', async () => {
      const original = makePost({
        id: 'story-1',
        type: PostType.STORY,
        media: [
          { id: 'm1', fileUrl: '/api/v1/attachments/file/m1.jpg', mimeType: 'image/jpeg', filePath: '2026/05/user/m1.jpg', fileName: 'm1.jpg', originalName: 'm1.jpg', fileSize: 1000 },
          { id: 'm2', fileUrl: '/api/v1/attachments/file/m2.mp4', mimeType: 'video/mp4', filePath: '2026/05/user/m2.mp4', fileName: 'm2.mp4', originalName: 'm2.mp4', fileSize: 5000 },
        ],
      });
      prisma.post.findFirst.mockResolvedValue(original);

      // First media duplication succeeds, second fails
      const duplicateMediaSpy = jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-m1.jpg', filePath: 'snapshots/new-m1.jpg', fileName: 'new-m1.jpg', fileSize: 1000, mimeType: 'image/jpeg' })
        .mockRejectedValueOnce(new Error('Upload failed'));
      const deleteMediaSpy = jest.spyOn(mediaService, 'deleteMedia').mockResolvedValue(undefined);

      await expect(
        service.repostPost('story-1', 'user-reposter', { targetType: PostType.POST })
      ).rejects.toThrow('Media snapshot or post creation failed during repost');

      // Verify the first duplicated media was rolled back
      expect(deleteMediaSpy).toHaveBeenCalledWith('/api/v1/attachments/file/new-m1.jpg');
      // Verify NO Post was created
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('duplicates media to new CDN URLs when reposting STORY as POST', async () => {
      const original = makePost({
        id: 'story-1',
        type: PostType.STORY,
        media: [
          { id: 'm1', fileUrl: '/api/v1/attachments/file/m1.jpg', mimeType: 'image/jpeg', filePath: '2026/05/user/m1.jpg', fileName: 'm1.jpg', originalName: 'm1.jpg', fileSize: 1000 },
          { id: 'm2', fileUrl: '/api/v1/attachments/file/m2.mp4', mimeType: 'video/mp4', filePath: '2026/05/user/m2.mp4', fileName: 'm2.mp4', originalName: 'm2.mp4', fileSize: 5000 },
        ],
        storyEffects: { someEffect: 'value' },
        audioUrl: '/api/v1/attachments/file/audio.mp3',
      });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'repost-snap' }));
      prisma.post.update.mockResolvedValue(original);

      const duplicateMediaSpy = jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-m1.jpg', filePath: '2026/05/snapshot/new-m1.jpg', fileName: 'new-m1.jpg', fileSize: 1000, mimeType: 'image/jpeg' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-m2.mp4', filePath: '2026/05/snapshot/new-m2.mp4', fileName: 'new-m2.mp4', fileSize: 5000, mimeType: 'video/mp4' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-audio.mp3', filePath: '2026/05/snapshot/new-audio.mp3', fileName: 'new-audio.mp3', fileSize: 2000, mimeType: 'audio/mpeg' });

      await service.repostPost('story-1', 'user-reposter', { targetType: PostType.POST });

      expect(duplicateMediaSpy).toHaveBeenCalledWith('/api/v1/attachments/file/m1.jpg');
      expect(duplicateMediaSpy).toHaveBeenCalledWith('/api/v1/attachments/file/m2.mp4');
      expect(duplicateMediaSpy).toHaveBeenCalledWith('/api/v1/attachments/file/audio.mp3');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: PostType.POST,
            audioUrl: '/api/v1/attachments/file/new-audio.mp3',
            storyEffects: { someEffect: 'value' },
          }),
        })
      );
    });

    it('snapshots moodEmoji, content and audio when reposting a STATUS as STATUS', async () => {
      // A STATUS is ephemeral (1h). A repost that merely referenced it would
      // render empty once the source expires. The repost must carry its own
      // copy of the mood + text + voice so it survives the original's TTL.
      const original = makePost({
        id: 'status-1',
        type: PostType.STATUS,
        visibility: 'PUBLIC',
        moodEmoji: '🔥',
        content: 'feeling great',
        originalLanguage: 'en',
        audioUrl: '/api/v1/attachments/file/mood.mp3',
      });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'status-repost' }));
      prisma.post.update.mockResolvedValue(original);

      const duplicateSpy = jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-mood.mp3', filePath: 'snap/new-mood.mp3', fileName: 'new-mood.mp3', fileSize: 1000, mimeType: 'audio/mpeg' });

      await service.repostPost('status-1', 'user-reposter', { targetType: PostType.STATUS });

      expect(duplicateSpy).toHaveBeenCalledWith('/api/v1/attachments/file/mood.mp3');
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: PostType.STATUS,
            moodEmoji: '🔥',
            content: 'feeling great',
            originalLanguage: 'en',
            audioUrl: '/api/v1/attachments/file/new-mood.mp3',
            repostOfId: 'status-1',
          }),
        })
      );
    });

    it('duplicates media + storyEffects when reposting a STORY as STORY', async () => {
      const original = makePost({
        id: 'story-2',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        media: [
          { id: 'm1', fileUrl: '/api/v1/attachments/file/s1.jpg', mimeType: 'image/jpeg', filePath: 'p/s1.jpg', fileName: 's1.jpg', originalName: 's1.jpg', fileSize: 1000 },
        ],
        storyEffects: { canvas: 'fx' },
        audioUrl: '/api/v1/attachments/file/bg.mp3',
      });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'story-repost' }));
      prisma.post.update.mockResolvedValue(original);

      const duplicateSpy = jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-s1.jpg', filePath: 'snap/new-s1.jpg', fileName: 'new-s1.jpg', fileSize: 1000, mimeType: 'image/jpeg' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-bg.mp3', filePath: 'snap/new-bg.mp3', fileName: 'new-bg.mp3', fileSize: 500, mimeType: 'audio/mpeg' });

      await service.repostPost('story-2', 'user-reposter', { targetType: PostType.STORY });

      expect(duplicateSpy).toHaveBeenCalledWith('/api/v1/attachments/file/s1.jpg');
      expect(duplicateSpy).toHaveBeenCalledWith('/api/v1/attachments/file/bg.mp3');
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: PostType.STORY,
            storyEffects: { canvas: 'fx' },
            audioUrl: '/api/v1/attachments/file/new-bg.mp3',
            repostOfId: 'story-2',
            media: { create: expect.arrayContaining([
              expect.objectContaining({ fileUrl: '/api/v1/attachments/file/new-s1.jpg' }),
            ]) },
          }),
        })
      );
    });

    it('returns null when original is deleted', async () => {
      prisma.post.findFirst.mockResolvedValue(null);
      const result = await service.repostPost('deleted-1', 'user-reposter');
      expect(result).toBeNull();
    });

    it('returns null when original is expired', async () => {
      const expiredOriginal = makePost({
        id: 'expired-1',
        type: PostType.STORY,
        expiresAt: new Date(Date.now() - 1000),
      });
      prisma.post.findFirst.mockResolvedValue(expiredOriginal);
      const result = await service.repostPost('expired-1', 'user-reposter');
      expect(result).toBeNull();
    });

    it('throws 403 when original visibility is not PUBLIC', async () => {
      const privateOriginal = makePost({ id: 'private-1', visibility: 'PRIVATE' });
      prisma.post.findFirst.mockResolvedValue(privateOriginal);
      await expect(
        service.repostPost('private-1', 'user-reposter')
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rolls back media AND audio when prisma.post.create fails', async () => {
      const original = makePost({
        id: 'story-x',
        type: PostType.STORY,
        media: [{ id: 'm1', fileUrl: '/api/v1/attachments/file/m1.jpg', mimeType: 'image/jpeg' }],
        audioUrl: '/api/v1/attachments/file/audio.mp3',
      });
      prisma.post.findFirst.mockResolvedValue(original);

      jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-m1.jpg', filePath: 'p', fileName: 'new-m1.jpg', fileSize: 100, mimeType: 'image/jpeg' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-audio.mp3', filePath: 'p', fileName: 'new-audio.mp3', fileSize: 200, mimeType: 'audio/mpeg' });
      const deleteSpy = jest.spyOn(mediaService, 'deleteMedia').mockResolvedValue(undefined);

      prisma.post.create.mockRejectedValue(new Error('DB constraint violation'));

      await expect(
        service.repostPost('story-x', 'user-1', { targetType: PostType.POST })
      ).rejects.toThrow();

      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/attachments/file/new-m1.jpg');
      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/attachments/file/new-audio.mp3');
    });

    it('sets expiresAt to 21h from now when reposting as STORY', async () => {
      const original = makePost({ id: 'src-1', type: PostType.STORY });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'r-1', ...args.data }));
      prisma.post.update.mockResolvedValue(original);

      const before = Date.now();
      await service.repostPost('src-1', 'user-1', { targetType: PostType.STORY });
      const after = Date.now();

      const createCall = prisma.post.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      expect(expiresAt).toBeInstanceOf(Date);
      const expectedMs = before + 21 * 3600_000;
      const actualMs = expiresAt.getTime();
      expect(actualMs).toBeGreaterThanOrEqual(expectedMs);
      expect(actualMs).toBeLessThanOrEqual(after + 21 * 3600_000);
    });

    it('sets expiresAt to 1h from now when reposting as STATUS', async () => {
      const original = makePost({ id: 'src-2', type: PostType.STATUS });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'r-2', ...args.data }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('src-2', 'user-1', { targetType: PostType.STATUS });

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.expiresAt).toBeInstanceOf(Date);
    });

    it('does NOT set expiresAt when reposting as POST', async () => {
      const original = makePost({ id: 'src-3', type: PostType.POST });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'r-3', ...args.data }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('src-3', 'user-1', { targetType: PostType.POST });

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.expiresAt).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getPostById — currentUserReactions enrichment
  // -----------------------------------------------------------------------

  describe('getPostById', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getPostById('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('returns post with currentUserReactions: [] when user has not reacted', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);

      const result = await service.getPostById('post-1', 'user-1');

      expect(result).not.toBeNull();
      expect((result as any).currentUserReactions).toEqual([]);
    });

    it('returns currentUserReactions: ["❤️"] when user reacted with that emoji', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([{ postId: 'post-1', emoji: '❤️' }]);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).currentUserReactions).toEqual(['❤️']);
    });

    it('returns currentUserReactions: ["❤️", "🔥"] for multi-emoji reactions', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([
        { postId: 'post-1', emoji: '❤️' },
        { postId: 'post-1', emoji: '🔥' },
      ]);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).currentUserReactions).toEqual(['❤️', '🔥']);
    });

    it('returns currentUserReactions: [] when currentUserId is undefined (anonymous read)', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getPostById('post-1', undefined);

      expect((result as any).currentUserReactions).toEqual([]);
      expect(prisma.postReaction.findMany).not.toHaveBeenCalled();
    });

    // Bookmark / repost personal-state enrichment — mirrors PostFeedService so
    // the post detail hydrates the SAME isBookmarkedByMe / isRepostedByMe as the
    // feed and reel viewer. Without these, the detail always showed "non
    // bookmarked" / "non reposted" even when the post was saved/reposted.

    it('returns isBookmarkedByMe: true when the viewer has bookmarked the post', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.postBookmark.findFirst.mockResolvedValue({ postId: 'post-1' });
      prisma.post.count.mockResolvedValue(0);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).isBookmarkedByMe).toBe(true);
      expect((result as any).isRepostedByMe).toBe(false);
    });

    it('returns isBookmarkedByMe: false when the viewer has not bookmarked the post', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.postBookmark.findFirst.mockResolvedValue(null);
      prisma.post.count.mockResolvedValue(0);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).isBookmarkedByMe).toBe(false);
    });

    it('returns isRepostedByMe: true when the viewer has reposted the post', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.postBookmark.findFirst.mockResolvedValue(null);
      prisma.post.count.mockResolvedValue(1);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).isRepostedByMe).toBe(true);
    });

    it('returns bookmark/repost flags false for anonymous read without querying them', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getPostById('post-1', undefined);

      expect((result as any).isBookmarkedByMe).toBe(false);
      expect((result as any).isRepostedByMe).toBe(false);
      expect(prisma.postBookmark.findFirst).not.toHaveBeenCalled();
      expect(prisma.post.count).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // deletePost
  // -----------------------------------------------------------------------

  describe('deletePost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.deletePost('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }));

      await expect(service.deletePost('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('soft-deletes the post by setting deletedAt', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));
      const deletedPost = makePost({ deletedAt: new Date() });
      prisma.post.update.mockResolvedValue(deletedPost);

      const result = await service.deletePost('post-1', 'user-1');

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: {
            deletedAt: expect.any(Date),
          },
        }),
      );
      expect(result).toEqual(deletedPost);
    });
  });

  describe('updatePost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);
      const result = await service.updatePost('missing', 'user-1', { content: 'x' });
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other', media: [] }));
      await expect(service.updatePost('post-1', 'user-1', { content: 'x' })).rejects.toThrow('FORBIDDEN');
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('switches a POST to a REEL when it carries media', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [{ id: 'm1' }] }));
      prisma.post.update.mockResolvedValue(makePost({ type: 'REEL' }));

      await service.updatePost('post-1', 'user-1', { type: PostType.REEL });

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.REEL }) }),
      );
    });

    it('removes only media that belongs to the post (ignores foreign ids)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [{ id: 'm1' }, { id: 'm2' }] }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.updatePost('post-1', 'user-1', { removeMediaIds: ['m1', 'foreign-media'] });

      expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['m1'] }, postId: 'post-1' },
      });
      expect(prisma.post.update).toHaveBeenCalled();
    });

    it('does not delete media when removeMediaIds is omitted', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [{ id: 'm1' }] }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.updatePost('post-1', 'user-1', { content: 'x' });

      expect(prisma.postMedia.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects removing the last media of a REEL (422) and deletes nothing', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'REEL', media: [{ id: 'm1' }] }));

      await expect(service.updatePost('post-1', 'user-1', { removeMediaIds: ['m1'] }))
        .rejects.toMatchObject({ statusCode: 422 });
      expect(prisma.postMedia.deleteMany).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('allows removing media from a REEL that keeps at least one', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'REEL', media: [{ id: 'm1' }, { id: 'm2' }] }));
      prisma.post.update.mockResolvedValue(makePost({ type: 'REEL' }));

      await service.updatePost('post-1', 'user-1', { removeMediaIds: ['m1'] });

      expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['m1'] }, postId: 'post-1' },
      });
    });

    it('rejects switching to REEL without media (422)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [] }));
      await expect(service.updatePost('post-1', 'user-1', { type: PostType.REEL }))
        .rejects.toMatchObject({ statusCode: 422 });
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('rejects a STORY -> POST type change (422)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [{ id: 'm1' }] }));
      await expect(service.updatePost('post-1', 'user-1', { type: PostType.POST }))
        .rejects.toMatchObject({ statusCode: 422 });
    });

    it('rejects a type change on a repost (422)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', repostOfId: 'orig-1', media: [{ id: 'm1' }] }));
      await expect(service.updatePost('post-1', 'user-1', { type: PostType.REEL }))
        .rejects.toMatchObject({ statusCode: 422 });
    });

    it('does not write type when it is unchanged', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [] }));
      prisma.post.update.mockResolvedValue(makePost());
      await service.updatePost('post-1', 'user-1', { type: PostType.POST });
      expect(prisma.post.update.mock.calls[0][0].data.type).toBeUndefined();
    });

    it('updates originalLanguage and clears stale translations on language change', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', originalLanguage: 'en', content: 'hello', media: [] }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.updatePost('post-1', 'user-1', { originalLanguage: 'fr' });

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ originalLanguage: 'fr', translations: {} }),
        }),
      );
    });

    it('does not touch originalLanguage/translations when language is unchanged', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', originalLanguage: 'en', media: [] }));
      prisma.post.update.mockResolvedValue(makePost());
      await service.updatePost('post-1', 'user-1', { originalLanguage: 'en', content: 'updated' });
      const call = prisma.post.update.mock.calls[0][0];
      expect(call.data.originalLanguage).toBeUndefined();
      expect(call.data.translations).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// PostCommentService
// ---------------------------------------------------------------------------

describe('PostCommentService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostCommentService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new PostCommentService(prisma);
  });

  // -----------------------------------------------------------------------
  // addComment
  // -----------------------------------------------------------------------

  describe('addComment', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.addComment('missing', 'user-1', 'Hello');
      expect(result).toBeNull();
      expect(prisma.postComment.create).not.toHaveBeenCalled();
    });

    it('creates a top-level comment and increments commentCount', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());

      const createdComment = makeComment({ id: 'new-comment' });
      prisma.postComment.create.mockResolvedValue(createdComment);
      prisma.post.update.mockResolvedValue(makePost({ commentCount: 6 }));

      const result = await service.addComment('post-1', 'user-1', 'Great post!');

      expect(prisma.postComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            postId: 'post-1',
            authorId: 'user-1',
            content: 'Great post!',
          }),
        }),
      );
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { commentCount: { increment: 1 } },
        }),
      );
      // `media: []` — addComment now returns the (possibly empty) comment media.
      expect(result).toEqual({ ...createdComment, media: [] });
    });

    it('throws PARENT_NOT_FOUND when parentId does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());
      prisma.postComment.findFirst.mockResolvedValue(null);

      await expect(
        service.addComment('post-1', 'user-1', 'Reply', 'bad-parent'),
      ).rejects.toThrow('PARENT_NOT_FOUND');

      expect(prisma.postComment.create).not.toHaveBeenCalled();
    });

    it('creates a reply and increments both commentCount and parent replyCount', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());
      const parentComment = makeComment({ id: 'parent-1' });
      prisma.postComment.findFirst.mockResolvedValue(parentComment);

      const reply = makeComment({ id: 'reply-1', parentId: 'parent-1' });
      prisma.postComment.create.mockResolvedValue(reply);
      prisma.post.update.mockResolvedValue(makePost());
      prisma.postComment.update.mockResolvedValue(parentComment);

      const result = await service.addComment('post-1', 'user-1', 'Nice!', 'parent-1');

      expect(prisma.postComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: 'parent-1',
          }),
        }),
      );
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { commentCount: { increment: 1 } },
        }),
      );
      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'parent-1' },
          data: { replyCount: { increment: 1 } },
        }),
      );
      expect(result).toEqual({ ...reply, media: [] });
    });
  });

  // -----------------------------------------------------------------------
  // deleteComment
  // -----------------------------------------------------------------------

  describe('deleteComment', () => {
    it('returns null when the comment does not exist', async () => {
      prisma.postComment.findFirst.mockResolvedValue(null);

      const result = await service.deleteComment('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment({ authorId: 'other-user' }));

      await expect(service.deleteComment('comment-1', 'user-1')).rejects.toThrow('FORBIDDEN');
      expect(prisma.postComment.update).not.toHaveBeenCalled();
    });

    it('soft-deletes the comment (subtree) and decrements commentCount', async () => {
      prisma.postComment.findFirst.mockResolvedValue(
        makeComment({ authorId: 'user-1', parentId: null }),
      );
      // No descendant replies → BFS returns empty on the first pass.
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postComment.updateMany.mockResolvedValue({ count: 1 });
      prisma.post.update.mockResolvedValue({});

      const result = await service.deleteComment('comment-1', 'user-1');

      expect(prisma.postComment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['comment-1'] } },
          data: { deletedAt: expect.any(Date) },
        }),
      );
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { commentCount: { decrement: 1 } },
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it('cascades to surviving replies and decrements commentCount by 1 + reply count', async () => {
      prisma.postComment.findFirst.mockResolvedValue(
        makeComment({ authorId: 'user-1', parentId: null }),
      );
      // First BFS pass returns two direct replies; second pass (their ids) returns none.
      prisma.postComment.findMany
        .mockResolvedValueOnce([{ id: 'reply-1' }, { id: 'reply-2' }])
        .mockResolvedValueOnce([]);
      prisma.postComment.updateMany.mockResolvedValue({ count: 3 });
      prisma.post.update.mockResolvedValue({});

      await service.deleteComment('comment-1', 'user-1');

      const softDeleted = prisma.postComment.updateMany.mock.calls[0][0].where.id.in;
      expect([...softDeleted].sort()).toEqual(['comment-1', 'reply-1', 'reply-2']);
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { commentCount: { decrement: 3 } } }),
      );
    });

    it('decrements parent replyCount when deleting a reply', async () => {
      prisma.postComment.findFirst.mockResolvedValue(
        makeComment({ authorId: 'user-1', parentId: 'parent-1' }),
      );
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postComment.updateMany.mockResolvedValue({ count: 1 });
      prisma.postComment.update.mockResolvedValue({});
      prisma.post.update.mockResolvedValue({});

      await service.deleteComment('comment-1', 'user-1');

      // The subtree soft-delete goes through updateMany …
      expect(prisma.postComment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['comment-1'] } },
          data: { deletedAt: expect.any(Date) },
        }),
      );
      // … and only the direct parent's replyCount is decremented.
      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'parent-1' },
          data: { replyCount: { decrement: 1 } },
        }),
      );
    });

    it('does not decrement parent replyCount for a top-level comment', async () => {
      prisma.postComment.findFirst.mockResolvedValue(
        makeComment({ authorId: 'user-1', parentId: null }),
      );
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postComment.updateMany.mockResolvedValue({ count: 1 });
      prisma.post.update.mockResolvedValue({});

      await service.deleteComment('comment-1', 'user-1');

      // Top-level delete: no parent replyCount update (the soft-delete uses updateMany).
      expect(prisma.postComment.update).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // likeComment
  // -----------------------------------------------------------------------

  describe('likeComment', () => {
    it('returns null when the comment does not exist', async () => {
      prisma.postComment.findFirst.mockResolvedValue(null);

      const result = await service.likeComment('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('upserts the reaction row (idempotent) and syncs likeCount = reactionCount = count(table)', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment());
      prisma.commentReaction.upsert.mockResolvedValue({});
      // Après l'upsert, la table contient 4 ❤️ → likeCount/reactionCount = 4.
      prisma.commentReaction.groupBy.mockResolvedValue([{ emoji: '❤️', _count: { emoji: 4 } }]);
      const updatedComment = makeComment({ likeCount: 4, reactionCount: 4, reactionSummary: { '❤️': 4 } });
      prisma.postComment.update.mockResolvedValue(updatedComment);

      const result = await service.likeComment('comment-1', 'user-1');

      // Idempotent : un seul like par (commentId,userId,emoji) via la contrainte unique.
      expect(prisma.commentReaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { comment_user_reaction_unique: { commentId: 'comment-1', userId: 'user-1', emoji: '❤️' } },
          create: { commentId: 'comment-1', userId: 'user-1', emoji: '❤️' },
          update: {},
        }),
      );
      // Compteurs AUTORITAIRES depuis la table (pas d'increment aveugle).
      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comment-1' },
          data: { likeCount: 4, reactionCount: 4, reactionSummary: { '❤️': 4 } },
        }),
      );
      expect(result).toEqual(updatedComment);
    });

    it('rebuilds reactionSummary per emoji from the table', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment());
      prisma.commentReaction.upsert.mockResolvedValue({});
      prisma.commentReaction.groupBy.mockResolvedValue([
        { emoji: '❤️', _count: { emoji: 2 } },
        { emoji: '🔥', _count: { emoji: 1 } },
      ]);
      prisma.postComment.update.mockResolvedValue(makeComment());

      await service.likeComment('comment-1', 'user-1', '🔥');

      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { likeCount: 3, reactionCount: 3, reactionSummary: { '❤️': 2, '🔥': 1 } },
        }),
      );
    });

    it('enforces one reaction per user (parité socket): a different emoji replaces the previous one', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment());
      prisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
      prisma.commentReaction.upsert.mockResolvedValue({});
      prisma.commentReaction.groupBy.mockResolvedValue([{ emoji: '🔥', _count: { emoji: 1 } }]);
      prisma.postComment.update.mockResolvedValue(makeComment({ likeCount: 1, reactionCount: 1, reactionSummary: { '🔥': 1 } }));

      await service.likeComment('comment-1', 'user-1', '🔥');

      // Toute réaction préexistante de ce user avec un AUTRE emoji est supprimée
      // AVANT l'upsert → au plus une ligne (commentId,userId) : pas de cumul
      // ❤️+🔥 comme le chemin socket (MAX_REACTIONS_PER_USER = 1) l'interdit.
      expect(prisma.commentReaction.deleteMany).toHaveBeenCalledWith({
        where: { commentId: 'comment-1', userId: 'user-1', emoji: { not: '🔥' } },
      });
      expect(prisma.commentReaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { comment_user_reaction_unique: { commentId: 'comment-1', userId: 'user-1', emoji: '🔥' } },
        }),
      );
      const deleteOrder = prisma.commentReaction.deleteMany.mock.invocationCallOrder[0];
      const upsertOrder = prisma.commentReaction.upsert.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(upsertOrder);
    });
  });

  // -----------------------------------------------------------------------
  // unlikeComment
  // -----------------------------------------------------------------------

  describe('unlikeComment', () => {
    it('returns null when the comment does not exist', async () => {
      prisma.postComment.findFirst.mockResolvedValue(null);

      const result = await service.unlikeComment('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('deletes the reaction row and syncs counters from the table', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment());
      prisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
      prisma.commentReaction.groupBy.mockResolvedValue([{ emoji: '❤️', _count: { emoji: 1 } }]);
      const updatedComment = makeComment({ likeCount: 1, reactionCount: 1, reactionSummary: { '❤️': 1 } });
      prisma.postComment.update.mockResolvedValue(updatedComment);

      const result = await service.unlikeComment('comment-1', 'user-1', '❤️');

      expect(prisma.commentReaction.deleteMany).toHaveBeenCalledWith({
        where: { commentId: 'comment-1', userId: 'user-1', emoji: '❤️' },
      });
      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comment-1' },
          data: { likeCount: 1, reactionCount: 1, reactionSummary: { '❤️': 1 } },
        }),
      );
      expect(result).toEqual(updatedComment);
    });

    it('drops the emoji key (and zeroes counters) when the table is empty', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment());
      prisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
      prisma.commentReaction.groupBy.mockResolvedValue([]);
      prisma.postComment.update.mockResolvedValue(makeComment());

      await service.unlikeComment('comment-1', 'user-1', '❤️');

      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { likeCount: 0, reactionCount: 0, reactionSummary: {} },
        }),
      );
    });
  });
});
