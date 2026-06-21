/**
 * PostCommentService Unit Tests — Phase 1C
 *
 * Covers currentUserReactions enrichment added to getComments / getReplies.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import { encodeCursor } from '../../../routes/posts/types';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeComment = (id: string) => ({
  id,
  content: 'Hello',
  originalLanguage: 'fr',
  translations: [],
  likeCount: 0,
  replyCount: 0,
  reactionCount: 0,
  effectFlags: 0,
  parentId: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatar: null },
});

const makeReactionRow = (commentId: string, emoji: string) => ({ commentId, emoji });

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

let mockPostCommentFindMany: jest.Mock;
let mockCommentReactionFindMany: jest.Mock;
let mockPrisma: Pick<PrismaClient, 'postComment' | 'commentReaction' | 'post'>;

beforeEach(() => {
  mockPostCommentFindMany = jest.fn();
  mockCommentReactionFindMany = jest.fn();

  mockPrisma = {
    postComment: {
      findMany: mockPostCommentFindMany,
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['postComment'],
    commentReaction: {
      findMany: mockCommentReactionFindMany,
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['commentReaction'],
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['post'],
  } as unknown as PrismaClient;
});

// ---------------------------------------------------------------------------
// getComments — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostCommentService.getComments', () => {
  it('returns currentUserReactions: [] when the user has not reacted to any comment', async () => {
    const comment = makeComment('c-1');
    mockPostCommentFindMany.mockResolvedValue([comment]);
    mockCommentReactionFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when the user reacted with that emoji', async () => {
    const comment = makeComment('c-2');
    mockPostCommentFindMany.mockResolvedValue([comment]);
    mockCommentReactionFindMany.mockResolvedValue([makeReactionRow('c-2', '❤️')]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual(['❤️']);
  });

  it('returns currentUserReactions: ["❤️", "🔥"] for multi-emoji reactions', async () => {
    const comment = makeComment('c-3');
    mockPostCommentFindMany.mockResolvedValue([comment]);
    mockCommentReactionFindMany.mockResolvedValue([
      makeReactionRow('c-3', '❤️'),
      makeReactionRow('c-3', '🔥'),
    ]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual(['❤️', '🔥']);
  });

  it('returns currentUserReactions: [] for all items when currentUserId is undefined (anonymous)', async () => {
    const comments = [makeComment('c-4'), makeComment('c-5')];
    mockPostCommentFindMany.mockResolvedValue(comments);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, undefined);

    for (const item of result.items) {
      expect(item.currentUserReactions).toEqual([]);
    }
    expect(mockCommentReactionFindMany).not.toHaveBeenCalled();
  });

  it('does not call commentReaction.findMany when there are no comments', async () => {
    mockPostCommentFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    expect(result.items).toHaveLength(0);
    expect(mockCommentReactionFindMany).not.toHaveBeenCalled();
  });

  it('correctly assigns reactions to different comments', async () => {
    const comments = [makeComment('c-6'), makeComment('c-7')];
    mockPostCommentFindMany.mockResolvedValue(comments);
    mockCommentReactionFindMany.mockResolvedValue([
      makeReactionRow('c-6', '👍'),
      makeReactionRow('c-7', '🔥'),
      makeReactionRow('c-7', '❤️'),
    ]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    const c6 = result.items.find((i) => i.id === 'c-6');
    const c7 = result.items.find((i) => i.id === 'c-7');
    expect(c6?.currentUserReactions).toEqual(['👍']);
    expect(c7?.currentUserReactions).toEqual(['🔥', '❤️']);
  });
});

// ---------------------------------------------------------------------------
// getReplies — currentUserReactions enrichment (same five cases)
// ---------------------------------------------------------------------------

describe('PostCommentService.getReplies', () => {
  it('returns currentUserReactions: [] when the user has not reacted to any reply', async () => {
    const reply = makeComment('r-1');
    mockPostCommentFindMany.mockResolvedValue([reply]);
    mockCommentReactionFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when the user reacted with that emoji', async () => {
    const reply = makeComment('r-2');
    mockPostCommentFindMany.mockResolvedValue([reply]);
    mockCommentReactionFindMany.mockResolvedValue([makeReactionRow('r-2', '❤️')]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual(['❤️']);
  });

  it('returns currentUserReactions: ["❤️", "🔥"] for multi-emoji reactions', async () => {
    const reply = makeComment('r-3');
    mockPostCommentFindMany.mockResolvedValue([reply]);
    mockCommentReactionFindMany.mockResolvedValue([
      makeReactionRow('r-3', '❤️'),
      makeReactionRow('r-3', '🔥'),
    ]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual(['❤️', '🔥']);
  });

  it('returns currentUserReactions: [] for all items when currentUserId is undefined (anonymous)', async () => {
    const replies = [makeComment('r-4'), makeComment('r-5')];
    mockPostCommentFindMany.mockResolvedValue(replies);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, undefined);

    for (const item of result.items) {
      expect(item.currentUserReactions).toEqual([]);
    }
    expect(mockCommentReactionFindMany).not.toHaveBeenCalled();
  });

  it('does not call commentReaction.findMany when there are no replies', async () => {
    mockPostCommentFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    expect(result.items).toHaveLength(0);
    expect(mockCommentReactionFindMany).not.toHaveBeenCalled();
  });

  it('correctly assigns reactions to different replies', async () => {
    const replies = [makeComment('r-6'), makeComment('r-7')];
    mockPostCommentFindMany.mockResolvedValue(replies);
    mockCommentReactionFindMany.mockResolvedValue([
      makeReactionRow('r-6', '👍'),
      makeReactionRow('r-7', '🔥'),
    ]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    const r6 = result.items.find((i) => i.id === 'r-6');
    const r7 = result.items.find((i) => i.id === 'r-7');
    expect(r6?.currentUserReactions).toEqual(['👍']);
    expect(r7?.currentUserReactions).toEqual(['🔥']);
  });
});

// ---------------------------------------------------------------------------
// getComments — top-level filter survives pagination
//
// Regression: when a cursor was present, `where.OR = [cursor clauses]` clobbered
// the `OR: [{parentId:null},{parentId:{isSet:false}}]` top-level guard, so page
// 2+ leaked replies (parentId set) into the top-level comment list.
// ---------------------------------------------------------------------------
describe('PostCommentService.getComments — pagination', () => {
  it('garde le filtre parentId (niveau 1 only) même avec un curseur', async () => {
    mockPostCommentFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const cursor = encodeCursor(new Date('2025-01-01T00:00:00Z'), 'c-1');
    await service.getComments('post-1', cursor, 20, 'user-1');

    const where = mockPostCommentFindMany.mock.calls[0][0].where;
    expect(where.postId).toBe('post-1');
    // Le filtre parentId DOIT survivre à la pagination (était écrasé par where.OR).
    expect(JSON.stringify(where.AND)).toContain('parentId');
    // Le curseur est une clause AND distincte, pas un remplacement.
    expect(Array.isArray(where.AND)).toBe(true);
    expect(where.AND.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// addComment — single-media attachment (reuses PostMedia via commentId FK)
// ---------------------------------------------------------------------------

const noopTrackingLinks = {
  collectContentTrackingLinks: jest.fn().mockResolvedValue([]),
} as any;

const makePostMediaMock = () => ({
  findUnique: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  updateMany: jest.fn(),
  deleteMany: jest.fn(),
});

const buildPrismaForAdd = (postMedia: ReturnType<typeof makePostMediaMock>) => {
  const created = {
    id: 'c-new', content: 'hi', originalLanguage: 'fr', translations: null,
    likeCount: 0, replyCount: 0, effectFlags: 0, parentId: null,
    createdAt: new Date('2025-01-01T00:00:00Z'), metadata: null,
    author: { id: 'a1', username: 'al', displayName: 'Al', avatar: null },
  };
  return {
    post: {
      findFirst: jest.fn().mockResolvedValue({ id: 'post-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    postComment: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue({}),
    },
    postMedia,
  } as unknown as PrismaClient;
};

describe('PostCommentService.addComment — media', () => {
  it('links the pending media to the new comment via commentId and returns it', async () => {
    const postMedia = makePostMediaMock();
    postMedia.findUnique.mockResolvedValue({ id: 'm-1', postId: null, commentId: null });
    postMedia.update.mockResolvedValue({});
    postMedia.findMany.mockResolvedValue([{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'http://x/m-1' }]);
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    const result: any = await service.addComment('post-1', 'a1', 'hi', undefined, 0, 'fr', 'm-1');

    expect(postMedia.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm-1' }, data: expect.objectContaining({ commentId: 'c-new' }) }),
    );
    expect(result.media).toHaveLength(1);
    expect(result.media[0].id).toBe('m-1');
  });

  it('persists the mobile transcription on the linked audio media', async () => {
    const postMedia = makePostMediaMock();
    postMedia.findUnique.mockResolvedValue({ id: 'm-2', postId: null, commentId: null });
    postMedia.update.mockResolvedValue({});
    postMedia.findMany.mockResolvedValue([{ id: 'm-2', mimeType: 'audio/mp4', fileUrl: 'http://x/m-2' }]);
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await service.addComment('post-1', 'a1', '', undefined, 0, 'fr', 'm-2', {
      text: 'bonjour', language: 'fr', segments: [],
    } as any);

    const data = postMedia.update.mock.calls[0][0].data;
    expect(data.commentId).toBe('c-new');
    expect(data.transcription).toEqual(expect.objectContaining({ text: 'bonjour', source: 'mobile' }));
  });

  it('throws MEDIA_NOT_AVAILABLE when the media is already linked', async () => {
    const postMedia = makePostMediaMock();
    postMedia.findUnique.mockResolvedValue({ id: 'm-3', postId: 'other-post', commentId: null });
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await expect(service.addComment('post-1', 'a1', 'hi', undefined, 0, 'fr', 'm-3'))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');
  });
});
