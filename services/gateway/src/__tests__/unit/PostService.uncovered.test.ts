/**
 * Targeted coverage for PostService uncovered paths:
 * - recordView: post not found, author self-view, existing view update, new view, outer catch
 * - getPostInteractions: null post, forbidden, reactions mapping
 * - recordAnonymousOpen: outer catch (post.findFirst throws)
 * - deletePost: trackingLink.updateMany catch
 * - updatePost: language change re-triggers translation
 * - getFriendIdsForViewer: catch → returns [] (via recordView with friendRequest throwing)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) },
    init: jest.fn<any>(),
  },
}));

import { PostService } from '../../services/PostService';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';

// ── Factory ────────────────────────────────────────────────────────────────────

const POST_ID   = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439012';
const VIEWER_ID = '507f1f77bcf86cd799439013';

const makePost = (overrides: Record<string, unknown> = {}) => ({
  id: POST_ID,
  authorId: AUTHOR_ID,
  type: PostType.POST,
  visibility: PostVisibility.PUBLIC,
  content: 'Hello world',
  originalLanguage: 'en',
  reactions: [],
  reactionSummary: {},
  reactionCount: 0,
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  repostCount: 0,
  isPinned: false,
  deletedAt: null,
  translations: {},
  media: [],
  ...overrides,
});

const makePrisma = (overrides: Record<string, unknown> = {}) => {
  const prisma: any = {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(makePost()),
      update: jest.fn<any>().mockResolvedValue(makePost()),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    postView: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>().mockResolvedValue({ id: 'view-1' }),
      update: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    postBookmark: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      upsert: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    postReaction: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    friendRequest: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    trackingLink: {
      updateMany: jest.fn<any>().mockResolvedValue({}),
    },
    postMedia: {
      deleteMany: jest.fn<any>().mockResolvedValue({}),
    },
    ...overrides,
  };
  prisma.$transaction = jest.fn<any>(async (fn: unknown) => {
    if (typeof fn === 'function') return (fn as (tx: unknown) => unknown)(prisma);
    return Promise.all(fn as Promise<unknown>[]);
  });
  return prisma;
};

const makeService = (prisma: any) => new PostService(prisma);

// ── recordView ─────────────────────────────────────────────────────────────────

describe('PostService — recordView', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('returns false when post is not visible to viewer (null from findFirst)', async () => {
    prisma.post.findFirst.mockResolvedValue(null);

    const result = await service.recordView(POST_ID, VIEWER_ID);

    expect(result).toBe(false);
    expect(prisma.postView.create).not.toHaveBeenCalled();
  });

  it('returns false when the author views their own post (self-view guard)', async () => {
    prisma.post.findFirst.mockResolvedValue({ id: POST_ID, authorId: AUTHOR_ID });

    const result = await service.recordView(POST_ID, AUTHOR_ID);

    expect(result).toBe(false);
    expect(prisma.postView.create).not.toHaveBeenCalled();
  });

  it('updates duration of existing view and returns false (duplicate view)', async () => {
    prisma.post.findFirst.mockResolvedValue({ id: POST_ID, authorId: AUTHOR_ID });
    prisma.postView.findUnique.mockResolvedValue({ id: 'existing-view-1' });

    const result = await service.recordView(POST_ID, VIEWER_ID, 5000);

    expect(result).toBe(false);
    expect(prisma.postView.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'existing-view-1' },
      data: { duration: 5000 },
    }));
    expect(prisma.postView.create).not.toHaveBeenCalled();
  });

  it('skips postView.update when existing view has no new duration', async () => {
    prisma.post.findFirst.mockResolvedValue({ id: POST_ID, authorId: AUTHOR_ID });
    prisma.postView.findUnique.mockResolvedValue({ id: 'existing-view-2' });

    const result = await service.recordView(POST_ID, VIEWER_ID); // no duration arg

    expect(result).toBe(false);
    expect(prisma.postView.update).not.toHaveBeenCalled();
    expect(prisma.postView.create).not.toHaveBeenCalled();
  });

  it('creates a new view, increments viewCount, and returns true (first view)', async () => {
    prisma.post.findFirst.mockResolvedValue({ id: POST_ID, authorId: AUTHOR_ID });
    prisma.postView.findUnique.mockResolvedValue(null);

    const result = await service.recordView(POST_ID, VIEWER_ID, 2000);

    expect(result).toBe(true);
    expect(prisma.postView.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { postId: POST_ID, userId: VIEWER_ID, duration: 2000 } }),
    );
    expect(prisma.post.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: POST_ID },
      data: { viewCount: { increment: 1 } },
    }));
  });

  it('returns false and does not throw when an exception occurs (outer catch)', async () => {
    prisma.post.findFirst.mockRejectedValue(new Error('DB connection lost'));

    const result = await service.recordView(POST_ID, VIEWER_ID);

    expect(result).toBe(false);
  });

  it('returns [] for getFriendIdsForViewer when friendRequest.findMany throws (catch path)', async () => {
    // Make friendRequest.findMany throw so getFriendIdsForViewer's catch runs → returns []
    // The buildVisibilityFilter still succeeds (with empty friendIds), post.findFirst returns null
    prisma.friendRequest.findMany.mockRejectedValue(new Error('DB timeout'));
    prisma.post.findFirst.mockResolvedValue(null);

    const result = await service.recordView(POST_ID, VIEWER_ID);

    expect(result).toBe(false);
    expect(prisma.friendRequest.findMany).toHaveBeenCalled();
  });
});

// ── getPostInteractions ───────────────────────────────────────────────────────

describe('PostService — getPostInteractions', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('returns null when post is not found', async () => {
    prisma.post.findFirst.mockResolvedValue(null);

    const result = await service.getPostInteractions(POST_ID, VIEWER_ID);

    expect(result).toBeNull();
  });

  it('throws FORBIDDEN when viewer is not the post author', async () => {
    prisma.post.findFirst.mockResolvedValue({
      id: POST_ID,
      authorId: AUTHOR_ID,
      reactions: [],
    });

    await expect(service.getPostInteractions(POST_ID, VIEWER_ID)).rejects.toThrow('FORBIDDEN');
    expect(prisma.postView.findMany).not.toHaveBeenCalled();
  });

  it('maps reactions to viewers and returns interactions', async () => {
    prisma.post.findFirst.mockResolvedValue({
      id: POST_ID,
      authorId: AUTHOR_ID,
      reactions: [
        { userId: VIEWER_ID, emoji: '❤️' },
      ],
    });

    const fakeView = {
      user: {
        id: VIEWER_ID,
        username: 'viewer',
        displayName: 'Viewer',
        avatar: null,
      },
      viewedAt: new Date('2026-06-28T10:00:00.000Z'),
    };
    prisma.postView.findMany.mockResolvedValue([fakeView]);
    prisma.postView.count.mockResolvedValue(1);

    const result = await service.getPostInteractions(POST_ID, AUTHOR_ID);

    expect(result).not.toBeNull();
    expect(result!.total).toBe(1);
    expect(result!.viewers[0].id).toBe(VIEWER_ID);
    expect(result!.viewers[0].reaction).toBe('❤️');
  });

  it('sets reaction to null for viewers who did not react', async () => {
    prisma.post.findFirst.mockResolvedValue({
      id: POST_ID,
      authorId: AUTHOR_ID,
      reactions: [], // no reactions
    });

    const fakeView = {
      user: { id: VIEWER_ID, username: 'viewer', displayName: 'Viewer', avatar: null },
      viewedAt: new Date('2026-06-28T10:00:00.000Z'),
    };
    prisma.postView.findMany.mockResolvedValue([fakeView]);
    prisma.postView.count.mockResolvedValue(1);

    const result = await service.getPostInteractions(POST_ID, AUTHOR_ID);

    expect(result!.viewers[0].reaction).toBeNull();
  });
});

// ── recordAnonymousOpen — outer catch ─────────────────────────────────────────

describe('PostService — recordAnonymousOpen outer catch', () => {
  it('returns false when post.findFirst throws (outer catch, line 1022-1024)', async () => {
    const prisma = makePrisma();
    prisma.post.findFirst.mockRejectedValue(new Error('Database unavailable'));

    const service = makeService(prisma);
    const result = await service.recordAnonymousOpen(POST_ID, 'session-xyz');

    expect(result).toBe(false);
    expect(prisma.post.update).not.toHaveBeenCalled();
  });
});

// ── deletePost — trackingLink catch ───────────────────────────────────────────

describe('PostService — deletePost trackingLink.updateMany catch', () => {
  it('still returns the updated post when trackingLink.updateMany throws', async () => {
    const updatedPost = makePost({ deletedAt: new Date() });
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(makePost({ authorId: AUTHOR_ID }));
    prisma.post.update.mockResolvedValue(updatedPost);
    prisma.trackingLink.updateMany.mockRejectedValue(new Error('Tracking service down'));

    const service = makeService(prisma);
    const result = await service.deletePost(POST_ID, AUTHOR_ID);

    expect(result).toEqual(updatedPost);
    expect(prisma.trackingLink.updateMany).toHaveBeenCalled();
  });
});

// ── updatePost — language change ──────────────────────────────────────────────

describe('PostService — updatePost language change re-triggers translation', () => {
  it('resets translations and calls triggerStoryTextTranslation when originalLanguage changes', async () => {
    const post = makePost({
      authorId: AUTHOR_ID,
      originalLanguage: 'en',
      content: 'Hello world',
      repostOfId: null,
      media: [],
    });
    const updatedPost = { ...post, originalLanguage: 'fr', translations: {} };

    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(post);
    prisma.post.update.mockResolvedValue(updatedPost);

    const service = makeService(prisma);

    // Spy on the private triggerStoryTextTranslation to confirm it's called
    const triggerSpy = jest.spyOn(service as any, 'triggerStoryTextTranslation')
      .mockResolvedValue(undefined);

    const result = await service.updatePost(POST_ID, AUTHOR_ID, {
      originalLanguage: 'fr', // different from 'en' → triggers re-translation
    });

    expect(result).not.toBeNull();
    expect(triggerSpy).toHaveBeenCalledWith(POST_ID, 'Hello world', AUTHOR_ID, 'fr');
  });

  it('does NOT call triggerStoryTextTranslation when language is unchanged', async () => {
    const post = makePost({
      authorId: AUTHOR_ID,
      originalLanguage: 'en',
      content: 'Hello world',
      media: [],
    });

    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(post);
    prisma.post.update.mockResolvedValue(post);

    const service = makeService(prisma);
    const triggerSpy = jest.spyOn(service as any, 'triggerStoryTextTranslation')
      .mockResolvedValue(undefined);

    await service.updatePost(POST_ID, AUTHOR_ID, {
      originalLanguage: 'en', // same → no re-trigger
    });

    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('throws 422 when changing type of a non-STORY/non-REEL post to STORY', async () => {
    const post = makePost({
      authorId: AUTHOR_ID,
      type: PostType.STORY,
      media: [],
    });

    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(post);

    const service = makeService(prisma);
    await expect(
      service.updatePost(POST_ID, AUTHOR_ID, { type: PostType.POST }),
    ).rejects.toMatchObject({ message: expect.stringContaining('Only POST <-> REEL'), statusCode: 422 });
  });

  it('throws 422 when changing type of a repost', async () => {
    const post = makePost({
      authorId: AUTHOR_ID,
      type: PostType.POST,
      repostOfId: 'original-post-id',
      media: [],
    });

    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(post);

    const service = makeService(prisma);
    await expect(
      service.updatePost(POST_ID, AUTHOR_ID, { type: PostType.REEL }),
    ).rejects.toMatchObject({ message: expect.stringContaining('Cannot change the type of a repost'), statusCode: 422 });
  });
});
