/**
 * PostCommentService Unit Tests — Phase 1C
 *
 * Covers currentUserReactions enrichment added to getComments / getReplies.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
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
