/**
 * Unit tests for PostService.
 * Covers: deletePost, bookmarkPost, unbookmarkPost, likePost, unlikePost,
 * shareWithTrackingLink, getPostById, repostPost, sharePost, pinPost, unpinPost,
 * recordView, getPostViews, getPostInteractions.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../services/posts/communityVisibility', () => ({
  getCommunityCoMemberIds: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstanceSync: jest.fn<any>().mockReturnValue(null) },
}));

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) },
  },
}));

import { PostService } from '../../../services/PostService';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    authorId: 'user-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello world',
    originalLanguage: 'en',
    deletedAt: null,
    shareCount: 5,
    likeCount: 2,
    bookmarkCount: 3,
    viewCount: 10,
    repostCount: 1,
    postOpenCount: 0,
    repostOfId: null,
    originalRepostOfId: null,
    expiresAt: null,
    isEdited: false,
    isPinned: false,
    reactions: [],
    metadata: null,
    media: [],
    ...overrides,
  };
}

const DEFAULT_LINK = {
  token: 'abc123',
  shortUrl: '/l/abc123',
  totalClicks: 7,
  uniqueClicks: 5,
  lastClickedAt: new Date('2026-01-01'),
  targetId: 'post-1',
  createdBy: 'user-1',
};

function makePrisma(opts: {
  postFindFirst?: unknown;
  postUpdate?: unknown;
  postCreate?: unknown;
  postCount?: number;
  bookmarkCreate?: unknown;
  bookmarkDeleteErr?: unknown;
  reactionFindMany?: unknown[];
  viewFindUnique?: unknown;
  viewFindMany?: unknown[];
  viewCount?: number;
  trackingLinkFindFirst?: unknown;
  trackingLinkFindUnique?: unknown;
  transactionFn?: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
} = {}) {
  const defaultPost = makePost();
  const txLink = DEFAULT_LINK;
  const txPost = makePost({ shareCount: 6 });

  const defaultTxClient = {
    post: {
      update: jest.fn<any>().mockResolvedValue(txPost),
      create: jest.fn<any>().mockResolvedValue(defaultPost),
    },
    trackingLink: {
      create: jest.fn<any>().mockResolvedValue(txLink),
    },
    postMedia: {
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  };

  return {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(
        opts.postFindFirst !== undefined ? opts.postFindFirst : defaultPost,
      ),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue(opts.postCreate ?? defaultPost),
      update: jest.fn<any>().mockResolvedValue(opts.postUpdate ?? defaultPost),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      count: jest.fn<any>().mockResolvedValue(opts.postCount ?? 0),
    },
    postBookmark: {
      create: jest.fn<any>().mockResolvedValue(
        opts.bookmarkCreate ?? { postId: 'post-1', userId: 'user-1' },
      ),
      delete: opts.bookmarkDeleteErr
        ? jest.fn<any>().mockRejectedValue(opts.bookmarkDeleteErr)
        : jest.fn<any>().mockResolvedValue({}),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    postReaction: {
      findMany: jest.fn<any>().mockResolvedValue(opts.reactionFindMany ?? []),
    },
    postView: {
      findUnique: jest.fn<any>().mockResolvedValue(opts.viewFindUnique ?? null),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      findMany: jest.fn<any>().mockResolvedValue(opts.viewFindMany ?? []),
      count: jest.fn<any>().mockResolvedValue(opts.viewCount ?? 0),
    },
    trackingLink: {
      findFirst: jest.fn<any>().mockResolvedValue(opts.trackingLinkFindFirst ?? null),
      findUnique: jest.fn<any>().mockResolvedValue(opts.trackingLinkFindUnique ?? null),
      create: jest.fn<any>().mockResolvedValue(txLink),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    postMedia: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    anonymousPostOpen: {
      create: jest.fn<any>().mockResolvedValue({}),
    },
    postEngagement: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      upsert: jest.fn<any>().mockResolvedValue({}),
    },
    friendRequest: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    $transaction: opts.transactionFn
      ? jest.fn<any>().mockImplementation(opts.transactionFn)
      : jest.fn<any>().mockImplementation(async (fn: any) => fn(defaultTxClient)),
  };
}

function makeSut(
  prisma: ReturnType<typeof makePrisma>,
  reactionOverrides?: { addReaction?: any; removeReaction?: any },
) {
  const reactionService = {
    addReaction: reactionOverrides?.addReaction ?? jest.fn<any>().mockResolvedValue({}),
    removeReaction: reactionOverrides?.removeReaction ?? jest.fn<any>().mockResolvedValue({}),
  };
  const trackingService = {
    collectContentTrackingLinks: jest.fn<any>().mockResolvedValue([]),
  };
  return {
    sut: new PostService(
      prisma as any,
      undefined,
      undefined,
      reactionService as any,
      trackingService as any,
    ),
    reactionService,
    trackingService,
  };
}

// ─── deletePost ───────────────────────────────────────────────────────────────

describe('deletePost', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.deletePost('post-1', 'user-1')).toBeNull();
  });

  it('throws FORBIDDEN when user is not the author', async () => {
    const prisma = makePrisma({ postFindFirst: makePost({ authorId: 'user-1' }) });
    const { sut } = makeSut(prisma);

    await expect(sut.deletePost('post-1', 'user-other')).rejects.toThrow('FORBIDDEN');
  });

  it('soft-deletes the post by setting deletedAt', async () => {
    const prisma = makePrisma();
    const { sut } = makeSut(prisma);

    await sut.deletePost('post-1', 'user-1');

    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  it('deactivates tracking links targeting the deleted post', async () => {
    const prisma = makePrisma();
    const { sut } = makeSut(prisma);

    await sut.deletePost('post-1', 'user-1');

    expect(prisma.trackingLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetId: 'post-1' },
        data: { isActive: false },
      }),
    );
  });

  it('still returns the post even when tracking link deactivation fails', async () => {
    const prisma = makePrisma();
    (prisma.trackingLink.updateMany as jest.Mock<any>).mockRejectedValue(new Error('DB error'));
    const { sut } = makeSut(prisma);

    const result = await sut.deletePost('post-1', 'user-1');

    expect(result).toEqual(expect.objectContaining({ id: 'post-1' }));
  });
});

// ─── bookmarkPost ─────────────────────────────────────────────────────────────

describe('bookmarkPost', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.bookmarkPost('post-1', 'user-1')).toBeNull();
  });

  it('is idempotent when already bookmarked (P2002)', async () => {
    const prisma = makePrisma({ postFindFirst: makePost({ bookmarkCount: 7 }) });
    const p2002 = Object.assign(new Error('Duplicate'), { code: 'P2002' });
    (prisma.postBookmark.create as jest.Mock<any>).mockRejectedValue(p2002);
    const { sut } = makeSut(prisma);

    const result = await sut.bookmarkPost('post-1', 'user-1') as any;

    expect(result).toEqual({ success: true, bookmarkCount: 7 });
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('increments bookmarkCount on fresh bookmark', async () => {
    const prisma = makePrisma({
      postFindFirst: makePost({ bookmarkCount: 3 }),
      postUpdate: { bookmarkCount: 4 },
    });
    const { sut } = makeSut(prisma);

    const result = await sut.bookmarkPost('post-1', 'user-1') as any;

    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bookmarkCount: { increment: 1 } } }),
    );
    expect(result).toEqual({ success: true, bookmarkCount: 4 });
  });

  it('re-throws non-P2002 errors from bookmark create', async () => {
    const prisma = makePrisma();
    (prisma.postBookmark.create as jest.Mock<any>).mockRejectedValue(new Error('DB down'));
    const { sut } = makeSut(prisma);

    await expect(sut.bookmarkPost('post-1', 'user-1')).rejects.toThrow('DB down');
  });
});

// ─── unbookmarkPost ───────────────────────────────────────────────────────────

describe('unbookmarkPost', () => {
  it('returns success:true without decrementing when bookmark did not exist', async () => {
    const prisma = makePrisma({
      bookmarkDeleteErr: new Error('Not found'),
      postFindFirst: makePost({ bookmarkCount: 5 }),
    });
    const { sut } = makeSut(prisma);

    await sut.unbookmarkPost('post-1', 'user-1');

    expect(prisma.post.updateMany).not.toHaveBeenCalled();
  });

  it('runs a guarded decrement when bookmark existed', async () => {
    const prisma = makePrisma({ postFindFirst: makePost({ bookmarkCount: 4 }) });
    const { sut } = makeSut(prisma);

    await sut.unbookmarkPost('post-1', 'user-1');

    expect(prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1', bookmarkCount: { gt: 0 } },
        data: { bookmarkCount: { decrement: 1 } },
      }),
    );
  });

  it('returns fresh bookmarkCount after delete', async () => {
    const prisma = makePrisma({ postFindFirst: makePost({ bookmarkCount: 2 }) });
    const { sut } = makeSut(prisma);

    const result = await sut.unbookmarkPost('post-1', 'user-1') as any;

    expect(result.success).toBe(true);
    expect(typeof result.bookmarkCount).toBe('number');
  });
});

// ─── likePost ─────────────────────────────────────────────────────────────────

describe('likePost', () => {
  it('returns null when postReactionService throws "not found"', async () => {
    const prisma = makePrisma();
    const { sut } = makeSut(prisma, {
      addReaction: jest.fn<any>().mockRejectedValue(new Error('Post not found')),
    });

    expect(await sut.likePost('post-1', 'user-1')).toBeNull();
  });

  it('returns null when postReactionService throws "deleted"', async () => {
    const prisma = makePrisma();
    const { sut } = makeSut(prisma, {
      addReaction: jest.fn<any>().mockRejectedValue(new Error('Post was deleted')),
    });

    expect(await sut.likePost('post-1', 'user-1')).toBeNull();
  });

  it('re-throws unexpected errors from postReactionService', async () => {
    const prisma = makePrisma();
    const { sut } = makeSut(prisma, {
      addReaction: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
    });

    await expect(sut.likePost('post-1', 'user-1')).rejects.toThrow('DB crash');
  });

  it('updates post with reactions JSON and likeCount on happy path', async () => {
    const reaction = { userId: 'user-1', emoji: '❤️', createdAt: new Date() };
    const prisma = makePrisma({ reactionFindMany: [reaction] });
    const { sut } = makeSut(prisma);

    await sut.likePost('post-1', 'user-1');

    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1' },
        data: expect.objectContaining({
          likeCount: 1,
          reactions: expect.arrayContaining([
            expect.objectContaining({ userId: 'user-1', emoji: '❤️' }),
          ]),
        }),
      }),
    );
  });

  it('uses the provided emoji argument', async () => {
    const prisma = makePrisma();
    const { sut, reactionService } = makeSut(prisma);

    await sut.likePost('post-1', 'user-1', '🔥');

    expect(reactionService.addReaction).toHaveBeenCalledWith(
      expect.objectContaining({ emoji: '🔥' }),
    );
  });
});

// ─── unlikePost ───────────────────────────────────────────────────────────────

describe('unlikePost', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.unlikePost('post-1', 'user-1')).toBeNull();
  });

  it('returns post unchanged when viewer has no reactions', async () => {
    const prisma = makePrisma({ reactionFindMany: [] });
    const { sut, reactionService } = makeSut(prisma);

    const result = await sut.unlikePost('post-1', 'user-1');

    expect(reactionService.removeReaction).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 'post-1' }));
  });

  it('calls removeReaction and updates post when reactions exist', async () => {
    const reaction = { userId: 'user-1', emoji: '❤️', createdAt: new Date() };
    const prisma = makePrisma({ reactionFindMany: [reaction] });
    const { sut, reactionService } = makeSut(prisma);

    await sut.unlikePost('post-1', 'user-1');

    expect(reactionService.removeReaction).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1', userId: 'user-1' }),
    );
    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ likeCount: expect.any(Number) }),
      }),
    );
  });
});

// ─── shareWithTrackingLink ────────────────────────────────────────────────────

describe('shareWithTrackingLink', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.shareWithTrackingLink('post-1', 'user-1', { baseUrl: 'https://example.com' })).toBeNull();
  });

  it('reuses an existing link without incrementing shareCount', async () => {
    const existing = { token: 'existing', shortUrl: '/l/existing' };
    const prisma = makePrisma({
      postFindFirst: makePost({ shareCount: 5 }),
      trackingLinkFindFirst: existing,
    });
    const { sut } = makeSut(prisma);

    const result = await sut.shareWithTrackingLink('post-1', 'user-1', { baseUrl: 'https://example.com' }) as any;

    expect(result.reused).toBe(true);
    expect(result.shareCount).toBe(5);
    expect(result.token).toBe('existing');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a new link and increments shareCount when no link exists', async () => {
    const txLink = { token: 'newtoken', shortUrl: '/l/newtoken', totalClicks: 0, uniqueClicks: 0, lastClickedAt: null };
    const txPost = makePost({ shareCount: 6 });
    const prisma = makePrisma({
      postFindFirst: makePost({ shareCount: 5 }),
      transactionFn: jest.fn<any>().mockImplementation(async (fn: any) =>
        fn({
          trackingLink: { create: jest.fn<any>().mockResolvedValue(txLink) },
          post: { update: jest.fn<any>().mockResolvedValue(txPost) },
        }),
      ),
    });
    const { sut } = makeSut(prisma);

    const result = await sut.shareWithTrackingLink('post-1', 'user-1', { baseUrl: 'https://example.com' }) as any;

    expect(result.reused).toBe(false);
    expect(result.token).toBe('newtoken');
    expect(result.shareCount).toBe(6);
  });

  it('handles P2002 race condition by reusing the winning link', async () => {
    const raced = { token: 'raced-token', shortUrl: '/l/raced-token' };
    const p2002 = Object.assign(new Error('Duplicate'), { code: 'P2002' });
    // First trackingLink.findFirst (exists check) → null
    // Second trackingLink.findFirst (race recovery) → raced link
    const prisma = makePrisma({ postFindFirst: makePost({ shareCount: 5 }) });
    (prisma.trackingLink.findFirst as jest.Mock<any>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raced);
    (prisma.$transaction as jest.Mock<any>).mockRejectedValue(p2002);
    const { sut } = makeSut(prisma);

    const result = await sut.shareWithTrackingLink('post-1', 'user-1', { baseUrl: 'https://example.com' }) as any;

    expect(result.reused).toBe(true);
    expect(result.token).toBe('raced-token');
  });

  it('strips trailing slashes from baseUrl', async () => {
    const raced = { token: 'tok', shortUrl: '/l/tok' };
    const prisma = makePrisma({ trackingLinkFindFirst: raced, postFindFirst: makePost() });
    const { sut } = makeSut(prisma);

    const result = await sut.shareWithTrackingLink('post-1', 'user-1', { baseUrl: 'https://example.com///' }) as any;

    expect(result.shortUrl).not.toContain('///');
  });
});

// ─── getPostShareLink ─────────────────────────────────────────────────────────

describe('getPostShareLink', () => {
  it('returns null when no tracking link exists for this user', async () => {
    const prisma = makePrisma({ trackingLinkFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.getPostShareLink('post-1', 'user-1', 'https://example.com')).toBeNull();
  });

  it('returns link stats when a tracking link exists', async () => {
    const link = {
      token: 'abc',
      shortUrl: '/l/abc',
      totalClicks: 10,
      uniqueClicks: 8,
      lastClickedAt: new Date('2026-01-15'),
    };
    const prisma = makePrisma({ trackingLinkFindFirst: link });
    const { sut } = makeSut(prisma);

    const result = await sut.getPostShareLink('post-1', 'user-1', 'https://example.com');

    expect(result).toEqual({
      token: 'abc',
      shortUrl: 'https://example.com/l/abc',
      totalClicks: 10,
      uniqueClicks: 8,
      lastClickedAt: link.lastClickedAt,
    });
  });
});

// ─── getPostById ──────────────────────────────────────────────────────────────

describe('getPostById', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.getPostById('post-1')).toBeNull();
  });

  it('returns anonymous shape (false flags) when no viewerUserId', async () => {
    const prisma = makePrisma();
    const { sut } = makeSut(prisma);

    const result = await sut.getPostById('post-1') as any;

    expect(result.isLikedByMe).toBe(false);
    expect(result.isBookmarkedByMe).toBe(false);
    expect(result.isRepostedByMe).toBe(false);
    expect(result.currentUserReactions).toEqual([]);
  });

  it('enriches with personal state when viewerUserId is provided', async () => {
    const reaction = { postId: 'post-1', emoji: '🔥' };
    const prisma = makePrisma({
      reactionFindMany: [reaction],
      postCount: 1,
    });
    // postBookmark.findFirst returns a bookmark object
    (prisma.postBookmark.findFirst as jest.Mock<any>).mockResolvedValue({ postId: 'post-1' });
    const { sut } = makeSut(prisma);

    const result = await sut.getPostById('post-1', 'viewer-1') as any;

    expect(result.isLikedByMe).toBe(true);
    expect(result.currentUserReactions).toContain('🔥');
    expect(result.isBookmarkedByMe).toBe(true);
    expect(result.isRepostedByMe).toBe(true);
  });

  it('sets isLikedByMe:false and isBookmarkedByMe:false when viewer has no interactions', async () => {
    const prisma = makePrisma({ reactionFindMany: [], postCount: 0 });
    const { sut } = makeSut(prisma);

    const result = await sut.getPostById('post-1', 'viewer-1') as any;

    expect(result.isLikedByMe).toBe(false);
    expect(result.isBookmarkedByMe).toBe(false);
    expect(result.isRepostedByMe).toBe(false);
  });
});

// ─── sharePost ────────────────────────────────────────────────────────────────

describe('sharePost', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.sharePost('post-1', 'user-1')).toBeNull();
  });

  it('increments shareCount on happy path', async () => {
    const prisma = makePrisma();
    const { sut } = makeSut(prisma);

    await sut.sharePost('post-1', 'user-1');

    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { shareCount: { increment: 1 } } }),
    );
  });
});

// ─── pinPost / unpinPost ──────────────────────────────────────────────────────

describe('pinPost', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.pinPost('post-1', 'user-1')).toBeNull();
  });

  it('throws FORBIDDEN when user is not the author', async () => {
    const prisma = makePrisma({ postFindFirst: makePost({ authorId: 'other' }) });
    const { sut } = makeSut(prisma);

    await expect(sut.pinPost('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
  });

  it('sets isPinned:true on happy path', async () => {
    const prisma = makePrisma();
    const { sut } = makeSut(prisma);

    await sut.pinPost('post-1', 'user-1');

    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPinned: true } }),
    );
  });
});

describe('unpinPost', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.unpinPost('post-1', 'user-1')).toBeNull();
  });

  it('sets isPinned:false on happy path', async () => {
    const prisma = makePrisma();
    const { sut } = makeSut(prisma);

    await sut.unpinPost('post-1', 'user-1');

    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPinned: false } }),
    );
  });
});

// ─── recordView ───────────────────────────────────────────────────────────────

describe('recordView', () => {
  it('returns false when post is not found (visibility guard)', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.recordView('post-1', 'user-1')).toBe(false);
  });

  it('returns false when viewer is the author', async () => {
    const prisma = makePrisma({ postFindFirst: makePost({ authorId: 'user-1', id: 'post-1' }) });
    const { sut } = makeSut(prisma);

    expect(await sut.recordView('post-1', 'user-1')).toBe(false);
    expect(prisma.postView.create).not.toHaveBeenCalled();
  });

  it('creates view and increments viewCount for first-time viewer', async () => {
    const prisma = makePrisma({
      postFindFirst: makePost({ authorId: 'author-1', id: 'post-1' }),
      viewFindUnique: null,
    });
    const { sut } = makeSut(prisma);

    const result = await sut.recordView('post-1', 'viewer-1');

    expect(result).toBe(true);
    expect(prisma.postView.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ postId: 'post-1', userId: 'viewer-1' }) }),
    );
    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { viewCount: { increment: 1 } } }),
    );
  });

  it('returns false and updates duration for repeat view', async () => {
    const existing = { id: 'view-1', postId: 'post-1', userId: 'viewer-1' };
    const prisma = makePrisma({
      postFindFirst: makePost({ authorId: 'author-1', id: 'post-1' }),
      viewFindUnique: existing,
    });
    const { sut } = makeSut(prisma);

    const result = await sut.recordView('post-1', 'viewer-1', 5000);

    expect(result).toBe(false);
    expect(prisma.postView.create).not.toHaveBeenCalled();
    expect(prisma.postView.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { duration: 5000 } }),
    );
  });

  it('caps duration at 300_000 ms', async () => {
    const prisma = makePrisma({
      postFindFirst: makePost({ authorId: 'author-1' }),
      viewFindUnique: null,
    });
    const { sut } = makeSut(prisma);

    await sut.recordView('post-1', 'viewer-1', 999_999);

    expect(prisma.postView.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ duration: 300_000 }) }),
    );
  });

  it('returns false (no throw) when a DB error occurs', async () => {
    const prisma = makePrisma({ postFindFirst: makePost({ authorId: 'author-1' }) });
    (prisma.postView.create as jest.Mock<any>).mockRejectedValue(new Error('DB error'));
    const { sut } = makeSut(prisma);

    expect(await sut.recordView('post-1', 'viewer-1')).toBe(false);
  });
});

// ─── getPostViews ─────────────────────────────────────────────────────────────

describe('getPostViews', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.getPostViews('post-1', 'user-1')).toBeNull();
  });

  it('throws FORBIDDEN when user is not the author', async () => {
    const prisma = makePrisma({ postFindFirst: makePost({ authorId: 'other' }) });
    const { sut } = makeSut(prisma);

    await expect(sut.getPostViews('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
  });

  it('returns paginated views with total and hasMore', async () => {
    const view = { user: { id: 'v1', username: 'viewer', displayName: 'Viewer', avatar: null }, viewedAt: new Date() };
    const prisma = makePrisma({ viewFindMany: [view], viewCount: 1 });
    const { sut } = makeSut(prisma);

    const result = await sut.getPostViews('post-1', 'user-1', 10, 0) as any;

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it('computes hasMore correctly when total exceeds offset+limit', async () => {
    const prisma = makePrisma({ viewFindMany: [], viewCount: 25 });
    const { sut } = makeSut(prisma);

    const result = await sut.getPostViews('post-1', 'user-1', 10, 0) as any;

    expect(result.hasMore).toBe(true);
  });
});

// ─── getPostInteractions ──────────────────────────────────────────────────────

describe('getPostInteractions', () => {
  it('returns null when post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.getPostInteractions('post-1', 'user-1')).toBeNull();
  });

  it('throws FORBIDDEN when user is not the author', async () => {
    const prisma = makePrisma({ postFindFirst: makePost({ authorId: 'other' }) });
    const { sut } = makeSut(prisma);

    await expect(sut.getPostInteractions('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
  });

  it('merges viewer reactions into the interactions response', async () => {
    const postWithReactions = makePost({
      reactions: [{ userId: 'viewer-1', emoji: '👏' }],
    });
    const view = { user: { id: 'viewer-1', username: 'v', displayName: 'V', avatar: null }, viewedAt: new Date() };
    const prisma = makePrisma({ postFindFirst: postWithReactions, viewFindMany: [view], viewCount: 1 });
    const { sut } = makeSut(prisma);

    const result = await sut.getPostInteractions('post-1', 'user-1', 10, 0) as any;

    const viewer = result.viewers.find((v: any) => v.id === 'viewer-1');
    expect(viewer?.reaction).toBe('👏');
  });

  it('returns null reaction for viewers with no reaction', async () => {
    const view = { user: { id: 'v2', username: 'v2', displayName: 'V2', avatar: null }, viewedAt: new Date() };
    const prisma = makePrisma({ viewFindMany: [view], viewCount: 1 });
    const { sut } = makeSut(prisma);

    const result = await sut.getPostInteractions('post-1', 'user-1', 10, 0) as any;

    expect(result.viewers[0].reaction).toBeNull();
  });
});

// ─── repostPost ───────────────────────────────────────────────────────────────

describe('repostPost', () => {
  it('returns null when original post is not found', async () => {
    const prisma = makePrisma({ postFindFirst: null });
    const { sut } = makeSut(prisma);

    expect(await sut.repostPost('post-1', 'user-2')).toBeNull();
  });

  it('returns null when original post has expired', async () => {
    const expired = makePost({ expiresAt: new Date(Date.now() - 1000) });
    const prisma = makePrisma({ postFindFirst: expired });
    const { sut } = makeSut(prisma);

    expect(await sut.repostPost('post-1', 'user-2')).toBeNull();
  });

  it('throws 403 when trying to repost private content', async () => {
    const privatePost = makePost({ visibility: 'FRIENDS' });
    const prisma = makePrisma({ postFindFirst: privatePost });
    const { sut } = makeSut(prisma);

    const err: any = await sut.repostPost('post-1', 'user-2').catch((e) => e);
    expect(err.message).toContain('private');
    expect(err.statusCode).toBe(403);
  });

  it('creates a repost and increments repostCount for non-ephemeral source', async () => {
    const original = makePost({ type: 'POST', visibility: 'PUBLIC' });
    const repost = makePost({ id: 'repost-1', authorId: 'user-2', repostOfId: 'post-1' });
    const prisma = makePrisma({ postFindFirst: original, postCreate: repost });
    const { sut } = makeSut(prisma);

    const result = await sut.repostPost('post-1', 'user-2');

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorId: 'user-2', repostOfId: 'post-1' }),
      }),
    );
    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1' },
        data: { repostCount: { increment: 1 } },
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'repost-1' }));
  });

  it('preserves quote content in the repost when isQuote:true', async () => {
    const original = makePost({ type: 'POST', visibility: 'PUBLIC' });
    const prisma = makePrisma({ postFindFirst: original });
    const { sut } = makeSut(prisma);

    await sut.repostPost('post-1', 'user-2', { content: 'My quote', isQuote: true });

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'My quote', isQuote: true }),
      }),
    );
  });

  it('chains originalRepostOfId to the root post', async () => {
    const original = makePost({
      type: 'POST',
      visibility: 'PUBLIC',
      repostOfId: 'root-post',
      originalRepostOfId: 'root-post',
    });
    const prisma = makePrisma({ postFindFirst: original });
    const { sut } = makeSut(prisma);

    await sut.repostPost('post-1', 'user-2');

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ originalRepostOfId: 'root-post' }),
      }),
    );
  });
});
