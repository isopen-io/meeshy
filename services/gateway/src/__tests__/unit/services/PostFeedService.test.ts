/**
 * PostFeedService Unit Tests — Phase 3D
 *
 * Covers currentUserReactions enrichment added to getFeed / getStories /
 * getUserPosts / getCommunityFeed / getBookmarks.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    authorId: 'author-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Test post',
    reactions: [],
    reactionSummary: {},
    reactionCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    isPinned: false,
    isDeleted: false,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    expiresAt: null,
    author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatar: null },
    media: [],
    comments: [],
    repostOf: null,
    ...overrides,
  };
}

function makeReactionRow(postId: string, emoji: string) {
  return { postId, emoji };
}

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

let mockPostFindMany: jest.Mock;
let mockPostReactionFindMany: jest.Mock;
let mockFriendRequestFindMany: jest.Mock;
let mockParticipantFindMany: jest.Mock;
let mockPostViewFindMany: jest.Mock;
let mockPostBookmarkFindMany: jest.Mock;
let mockPrisma: PrismaClient;

beforeEach(() => {
  mockPostFindMany = jest.fn();
  mockPostReactionFindMany = jest.fn();
  mockFriendRequestFindMany = jest.fn().mockResolvedValue([]);
  mockParticipantFindMany = jest.fn().mockResolvedValue([]);
  mockPostViewFindMany = jest.fn().mockResolvedValue([]);
  mockPostBookmarkFindMany = jest.fn();

  mockPrisma = {
    post: {
      findMany: mockPostFindMany,
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
    } as unknown as PrismaClient['post'],
    postReaction: {
      findMany: mockPostReactionFindMany,
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
    } as unknown as PrismaClient['postReaction'],
    friendRequest: {
      findMany: mockFriendRequestFindMany,
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
    } as unknown as PrismaClient['friendRequest'],
    participant: {
      findMany: mockParticipantFindMany,
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
    } as unknown as PrismaClient['participant'],
    postView: {
      findMany: mockPostViewFindMany,
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
    } as unknown as PrismaClient['postView'],
    postBookmark: {
      findMany: mockPostBookmarkFindMany,
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
    } as unknown as PrismaClient['postBookmark'],
  } as unknown as PrismaClient;
});

// ---------------------------------------------------------------------------
// PostFeedService.getFeed — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getFeed', () => {
  it('returns currentUserReactions: [] when user has not reacted to any post', async () => {
    const post = makePost('p-1');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when user reacted to a post', async () => {
    const post = makePost('p-2');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('p-2', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
  });

  it('returns currentUserReactions: ["❤️", "🔥"] for multi-emoji reactions', async () => {
    const post = makePost('p-3');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([
      makeReactionRow('p-3', '❤️'),
      makeReactionRow('p-3', '🔥'),
    ]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️', '🔥']);
  });

  it('skips the postReaction batch query when the post list is empty', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(result.items).toHaveLength(0);
    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });

  it('correctly maps each reaction to the right post in a multi-post batch', async () => {
    const posts = [makePost('p-4'), makePost('p-5')];
    mockPostFindMany.mockResolvedValue(posts);
    mockPostReactionFindMany.mockResolvedValue([
      makeReactionRow('p-4', '👍'),
      makeReactionRow('p-5', '🔥'),
      makeReactionRow('p-5', '❤️'),
    ]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    const p4 = result.items.find((i: any) => i.id === 'p-4') as any;
    const p5 = result.items.find((i: any) => i.id === 'p-5') as any;
    expect(p4.currentUserReactions).toEqual(['👍']);
    expect(p5.currentUserReactions).toEqual(['🔥', '❤️']);
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getStories — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getStories', () => {
  it('returns currentUserReactions: [] when user has not reacted to any story', async () => {
    const story = makePost('s-1', { type: 'STORY' });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostViewFindMany.mockResolvedValue([]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect(result).toHaveLength(1);
    expect((result[0] as any).currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when user reacted to a story', async () => {
    const story = makePost('s-2', { type: 'STORY' });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostViewFindMany.mockResolvedValue([]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('s-2', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect((result[0] as any).currentUserReactions).toEqual(['❤️']);
  });

  it('skips the postReaction batch query when the stories list is empty', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getUserPosts — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getUserPosts', () => {
  it('returns currentUserReactions: [] when viewerUserId is undefined (anonymous)', async () => {
    const post = makePost('up-1');
    mockPostFindMany.mockResolvedValue([post]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getUserPosts('author-1', undefined);

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });

  it('returns currentUserReactions: ["❤️"] when viewer has reacted', async () => {
    const post = makePost('up-2');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('up-2', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getUserPosts('author-1', 'viewer-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
  });

  it('skips postReaction batch query when post list is empty', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getUserPosts('author-1', 'viewer-1');

    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getCommunityFeed — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getCommunityFeed', () => {
  it('returns currentUserReactions: [] when viewerUserId is undefined (anonymous)', async () => {
    const post = makePost('cp-1');
    mockPostFindMany.mockResolvedValue([post]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getCommunityFeed('community-1', undefined);

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });

  it('returns currentUserReactions: ["🔥"] when viewer has reacted', async () => {
    const post = makePost('cp-2');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('cp-2', '🔥')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getCommunityFeed('community-1', 'viewer-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['🔥']);
  });

  it('correctly maps reactions to their respective posts in multi-post batch', async () => {
    const posts = [makePost('cp-3'), makePost('cp-4')];
    mockPostFindMany.mockResolvedValue(posts);
    mockPostReactionFindMany.mockResolvedValue([
      makeReactionRow('cp-3', '❤️'),
    ]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getCommunityFeed('community-1', 'viewer-1');

    const cp3 = result.items.find((i: any) => i.id === 'cp-3') as any;
    const cp4 = result.items.find((i: any) => i.id === 'cp-4') as any;
    expect(cp3.currentUserReactions).toEqual(['❤️']);
    expect(cp4.currentUserReactions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getBookmarks — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getBookmarks', () => {
  it('returns currentUserReactions: [] when user has not reacted to any bookmarked post', async () => {
    const post = makePost('bp-1');
    mockPostBookmarkFindMany.mockResolvedValue([{ post, createdAt: new Date(), id: 'bk-1' }]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getBookmarks('user-1');

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when user reacted to a bookmarked post', async () => {
    const post = makePost('bp-2');
    mockPostBookmarkFindMany.mockResolvedValue([{ post, createdAt: new Date(), id: 'bk-2' }]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('bp-2', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getBookmarks('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
  });

  it('skips postReaction batch query when bookmarks list is empty', async () => {
    mockPostBookmarkFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getBookmarks('user-1');

    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });
});
