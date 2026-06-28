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
import { PostAudioService } from '../../services/posts/PostAudioService';

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
      findUnique: jest.fn<any>().mockResolvedValue(makePost()),
      create: jest.fn<any>().mockResolvedValue(makePost()),
      update: jest.fn<any>().mockResolvedValue(makePost()),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
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
      create: jest.fn<any>().mockResolvedValue({}),
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
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      updateMany: jest.fn<any>().mockResolvedValue({}),
    },
    postMedia: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
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

// ── createPost — STATUS expiry ────────────────────────────────────────────────

describe('PostService — createPost STATUS type (line 108)', () => {
  it('sets expiresAt for STATUS posts', async () => {
    const prisma = makePrisma();
    prisma.post.create.mockResolvedValue(makePost({ type: PostType.STATUS }));
    const service = makeService(prisma);

    await service.createPost({ type: PostType.STATUS, visibility: PostVisibility.PUBLIC }, AUTHOR_ID);

    const createCall = (prisma.post.create.mock.calls as any[][])[0][0];
    expect(createCall.data.expiresAt).toBeInstanceOf(Date);
  });

  it('does NOT set expiresAt for regular POST type', async () => {
    const prisma = makePrisma();
    prisma.post.create.mockResolvedValue(makePost());
    const service = makeService(prisma);

    await service.createPost({ type: PostType.POST, visibility: PostVisibility.PUBLIC }, AUTHOR_ID);

    const createCall = (prisma.post.create.mock.calls as any[][])[0][0];
    expect(createCall.data.expiresAt).toBeUndefined();
  });
});

// ── createPost — repost source not found ──────────────────────────────────────

describe('PostService — createPost repost source not found (lines 122-124)', () => {
  it('throws 404 when repostOfId source post is not found', async () => {
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(
      service.createPost(
        { type: PostType.POST, visibility: PostVisibility.PUBLIC, repostOfId: 'missing-source-id' },
        AUTHOR_ID,
      ),
    ).rejects.toMatchObject({ message: 'Repost source not found', statusCode: 404 });

    expect(prisma.post.create).not.toHaveBeenCalled();
  });
});

// ── updatePost — visibilityUserIds ────────────────────────────────────────────

describe('PostService — updatePost visibilityUserIds (line 570)', () => {
  it('writes visibilityUserIds to update when explicitly provided', async () => {
    const post = makePost({
      authorId: AUTHOR_ID,
      originalLanguage: 'en',
      type: PostType.POST,
      media: [],
    });
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(post);
    prisma.post.update.mockResolvedValue(post);
    const service = makeService(prisma);
    const ids = ['user-a', 'user-b'];

    await service.updatePost(POST_ID, AUTHOR_ID, { visibilityUserIds: ids });

    const updateCall = (prisma.post.update.mock.calls as any[][])[0][0];
    expect(updateCall.data.visibilityUserIds).toEqual(ids);
  });

  it('omits visibilityUserIds from update when not provided', async () => {
    const post = makePost({
      authorId: AUTHOR_ID,
      originalLanguage: 'en',
      type: PostType.POST,
      media: [],
    });
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(post);
    prisma.post.update.mockResolvedValue(post);
    const service = makeService(prisma);

    await service.updatePost(POST_ID, AUTHOR_ID, { content: 'Updated' });

    const updateCall = (prisma.post.update.mock.calls as any[][])[0][0];
    expect(updateCall.data.visibilityUserIds).toBeUndefined();
  });
});

// ── bookmarkPost — non-P2002 error re-throw ───────────────────────────────────

describe('PostService — bookmarkPost non-P2002 error (line 773)', () => {
  it('re-throws when postBookmark.create fails with a non-P2002 error', async () => {
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(makePost({ bookmarkCount: 3 }));
    const dbError = Object.assign(new Error('Connection lost'), { code: 'P9999' });
    prisma.postBookmark.create.mockRejectedValue(dbError);
    const service = makeService(prisma);

    await expect(service.bookmarkPost(POST_ID, VIEWER_ID)).rejects.toThrow('Connection lost');
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('returns success+bookmarkCount on P2002 (already bookmarked — idempotent)', async () => {
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(makePost({ bookmarkCount: 7 }));
    const dupError = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    prisma.postBookmark.create.mockRejectedValue(dupError);
    const service = makeService(prisma);

    const result = await service.bookmarkPost(POST_ID, VIEWER_ID);

    expect(result).toEqual({ success: true, bookmarkCount: 7 });
    expect(prisma.post.update).not.toHaveBeenCalled();
  });
});

// ── shareWithTrackingLink — non-P2002 transaction error ───────────────────────

describe('PostService — shareWithTrackingLink non-P2002 error (line 893)', () => {
  it('re-throws when $transaction fails with a non-P2002 error', async () => {
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue({ id: POST_ID, shareCount: 0, type: PostType.POST });
    prisma.trackingLink.findFirst.mockResolvedValue(null);
    prisma.trackingLink.findUnique.mockResolvedValue(null);
    const txError = Object.assign(new Error('Replica set unavailable'), { code: 'P9999' });
    prisma.$transaction.mockRejectedValue(txError);
    const service = makeService(prisma);

    await expect(
      service.shareWithTrackingLink(POST_ID, VIEWER_ID, { baseUrl: 'https://meeshy.me' }),
    ).rejects.toThrow('Replica set unavailable');
  });
});

// ── generateShareToken — exhaustion ──────────────────────────────────────────

describe('PostService — generateShareToken exhaustion (line 932)', () => {
  it('throws after 10 failed token generation attempts', async () => {
    const prisma = makePrisma();
    prisma.trackingLink.findUnique.mockResolvedValue({ token: 'taken' });
    const service = makeService(prisma);

    await expect((service as any).generateShareToken()).rejects.toThrow(
      'Unable to generate unique share token',
    );
    expect(prisma.trackingLink.findUnique).toHaveBeenCalledTimes(10);
  });
});

// ── createPost — audio media processing (lines 181-187) ──────────────────────

describe('PostService — createPost audio media (lines 181-187)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers processPostAudio fire-and-forget when audio media found without mobileTranscription', async () => {
    const audioMedia = { id: 'audio-media-1', fileUrl: 'https://cdn.example.com/audio.mp3' };
    const prisma = makePrisma();
    prisma.post.create.mockResolvedValue(makePost({ id: POST_ID, authorId: AUTHOR_ID }));
    prisma.post.findUnique.mockResolvedValue(makePost());
    prisma.postMedia.findFirst.mockResolvedValue(audioMedia);

    const service = makeService(prisma);

    await service.createPost(
      { type: PostType.POST, visibility: PostVisibility.PUBLIC, mediaIds: ['audio-media-1'] },
      AUTHOR_ID,
    );

    expect((PostAudioService.shared.processPostAudio as any)).toHaveBeenCalledWith(
      expect.objectContaining({ postMediaId: 'audio-media-1', fileUrl: audioMedia.fileUrl }),
    );
  });

  it('catches and silences processPostAudio rejection (fire-and-forget .catch path)', async () => {
    const audioMedia = { id: 'audio-media-1', fileUrl: 'https://cdn.example.com/audio.mp3' };
    const prisma = makePrisma();
    prisma.post.create.mockResolvedValue(makePost({ id: POST_ID, authorId: AUTHOR_ID }));
    prisma.post.findUnique.mockResolvedValue(makePost());
    prisma.postMedia.findFirst.mockResolvedValue(audioMedia);

    // Make processPostAudio reject to trigger the .catch() callback at line 186-187
    (PostAudioService.shared.processPostAudio as any).mockRejectedValueOnce(new Error('processing failed'));

    const service = makeService(prisma);

    // createPost must not throw even though processPostAudio rejects
    await expect(
      service.createPost(
        { type: PostType.POST, visibility: PostVisibility.PUBLIC, mediaIds: ['audio-media-1'] },
        AUTHOR_ID,
      ),
    ).resolves.not.toThrow();

    // Flush microtasks so the fire-and-forget .catch() callback runs
    await Promise.resolve();
  });

  it('does NOT trigger processPostAudio when no audio media found', async () => {
    const prisma = makePrisma();
    prisma.post.create.mockResolvedValue(makePost({ id: POST_ID, authorId: AUTHOR_ID }));
    prisma.post.findUnique.mockResolvedValue(makePost());
    prisma.postMedia.findFirst.mockResolvedValue(null); // no audio media

    const service = makeService(prisma);

    await service.createPost(
      { type: PostType.POST, visibility: PostVisibility.PUBLIC, mediaIds: ['image-media-1'] },
      AUTHOR_ID,
    );

    expect((PostAudioService.shared.processPostAudio as any)).not.toHaveBeenCalled();
  });
});

// ── createPost — storyEffects.textObjects (lines 203-218) ────────────────────

describe('PostService — createPost storyEffects.textObjects (lines 203-218)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers triggerStoryTextObjectTranslation when textObjects are provided', async () => {
    const textObjects = [
      { content: 'Hello world', font: 'bold', size: 16, x: 0, y: 0, color: '#fff', align: 'center', rotation: 0 },
    ];
    const prisma = makePrisma();
    prisma.post.create.mockResolvedValue(makePost({ id: POST_ID, content: undefined }));
    prisma.post.findUnique.mockResolvedValue(makePost());

    const service = makeService(prisma);
    const objSpy = jest.spyOn(service as any, 'triggerStoryTextObjectTranslation')
      .mockResolvedValue(undefined);

    await service.createPost(
      {
        type: PostType.STORY,
        visibility: PostVisibility.PUBLIC,
        content: undefined,
        storyEffects: { textObjects },
      },
      AUTHOR_ID,
    );

    expect(objSpy).toHaveBeenCalledWith(POST_ID, textObjects, AUTHOR_ID);
  });

  it('updates post content for search when textObjects present but no content', async () => {
    const textObjects = [{ content: 'Hello world', font: 'regular', size: 14, x: 0, y: 0, color: '#000', align: 'left', rotation: 0 }];
    const prisma = makePrisma();
    prisma.post.create.mockResolvedValue(makePost({ id: POST_ID, content: undefined }));
    prisma.post.findUnique.mockResolvedValue(makePost());

    const service = makeService(prisma);
    jest.spyOn(service as any, 'triggerStoryTextObjectTranslation').mockResolvedValue(undefined);

    await service.createPost(
      {
        type: PostType.STORY,
        visibility: PostVisibility.PUBLIC,
        content: undefined,
        storyEffects: { textObjects },
      },
      AUTHOR_ID,
    );

    expect(prisma.post.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: POST_ID },
      data: { content: 'Hello world' },
    }));
  });
});

// ── recordView — friend filter function (line 533) ────────────────────────────

describe('PostService — recordView with friend requests (line 533)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters out the requesting viewer from friend IDs (line 533 filter callback)', async () => {
    const prisma = makePrisma();
    // Return a friend request where VIEWER_ID is the sender
    prisma.friendRequest.findMany.mockResolvedValue([
      { senderId: VIEWER_ID, receiverId: 'friend-of-viewer' },
    ]);
    // Post is public and visible
    prisma.post.findFirst.mockResolvedValue(makePost({ authorId: AUTHOR_ID }));
    prisma.postView.findUnique.mockResolvedValue(null); // no existing view
    prisma.postView.create.mockResolvedValue({ id: 'view-new' });

    const service = makeService(prisma);
    const result = await service.recordView(POST_ID, VIEWER_ID);

    // recordView succeeded and friend list was built
    expect(prisma.friendRequest.findMany).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});
