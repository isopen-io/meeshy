import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import { canUserViewPost, type PostVisibilityRecord } from '../postVisibility';

const makePrisma = (friendResult: { id: string } | null = null) => ({
  friendRequest: {
    findFirst: jest.fn().mockResolvedValue(friendResult),
  },
});

const makePost = (overrides: Partial<PostVisibilityRecord> = {}): PostVisibilityRecord => ({
  authorId: 'author-1',
  visibility: PostVisibility.PUBLIC,
  visibilityUserIds: [],
  ...overrides,
});

describe('canUserViewPost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('author can always see their own post', () => {
    it('returns true when userId === authorId, regardless of visibility', async () => {
      const prisma = makePrisma();
      const post = makePost({ authorId: 'user-1', visibility: PostVisibility.PRIVATE });
      const result = await canUserViewPost(prisma as any, post, 'user-1');
      expect(result).toBe(true);
      expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('PUBLIC visibility', () => {
    it('returns true for any non-author user', async () => {
      const prisma = makePrisma();
      const post = makePost({ visibility: PostVisibility.PUBLIC });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(true);
      expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('PRIVATE visibility', () => {
    it('returns false for any non-author user', async () => {
      const prisma = makePrisma();
      const post = makePost({ visibility: PostVisibility.PRIVATE });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(false);
      expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('ONLY visibility', () => {
    it('returns true when userId is in visibilityUserIds', async () => {
      const prisma = makePrisma();
      const post = makePost({ visibility: PostVisibility.ONLY, visibilityUserIds: ['viewer-1', 'viewer-2'] });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(true);
      expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
    });

    it('returns false when userId is not in visibilityUserIds', async () => {
      const prisma = makePrisma();
      const post = makePost({ visibility: PostVisibility.ONLY, visibilityUserIds: ['viewer-2'] });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(false);
      expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
    });

    it('returns false when visibilityUserIds is empty', async () => {
      const prisma = makePrisma();
      const post = makePost({ visibility: PostVisibility.ONLY, visibilityUserIds: [] });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(false);
    });
  });

  describe('FRIENDS visibility', () => {
    it('returns true when userId is a friend of the author', async () => {
      const prisma = makePrisma({ id: 'fr-001' });
      const post = makePost({ visibility: PostVisibility.FRIENDS });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(true);
      expect(prisma.friendRequest.findFirst).toHaveBeenCalledWith({
        where: {
          status: 'accepted',
          OR: [
            { senderId: 'author-1', receiverId: 'viewer-1' },
            { senderId: 'viewer-1', receiverId: 'author-1' },
          ],
        },
        select: { id: true },
      });
    });

    it('returns false when userId is not a friend', async () => {
      const prisma = makePrisma(null);
      const post = makePost({ visibility: PostVisibility.FRIENDS });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(false);
    });
  });

  describe('EXCEPT visibility (friends except excluded users)', () => {
    it('returns true when userId is a friend and not in exclusion list', async () => {
      const prisma = makePrisma({ id: 'fr-001' });
      const post = makePost({ visibility: PostVisibility.EXCEPT, visibilityUserIds: ['excluded-user'] });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(true);
    });

    it('returns false when userId is a friend but in exclusion list', async () => {
      const prisma = makePrisma({ id: 'fr-001' });
      const post = makePost({ visibility: PostVisibility.EXCEPT, visibilityUserIds: ['viewer-1'] });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(false);
    });

    it('returns false when userId is not a friend (even if not excluded)', async () => {
      const prisma = makePrisma(null);
      const post = makePost({ visibility: PostVisibility.EXCEPT, visibilityUserIds: [] });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(false);
    });
  });

  describe('COMMUNITY visibility (shared community)', () => {
    it('returns true when viewer shares a community with the author', async () => {
      const prisma = {
        friendRequest: { findFirst: jest.fn() },
        communityMember: {
          findMany: jest.fn().mockResolvedValue([{ communityId: 'c1' }]),
          findFirst: jest.fn().mockResolvedValue({ id: 'm1' }),
        },
      };
      const post = makePost({ visibility: PostVisibility.COMMUNITY });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(true);
      expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
    });

    it('returns false when viewer shares no community with the author', async () => {
      const prisma = {
        friendRequest: { findFirst: jest.fn() },
        communityMember: {
          findMany: jest.fn().mockResolvedValue([{ communityId: 'c1' }]),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const post = makePost({ visibility: PostVisibility.COMMUNITY });
      expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(false);
    });
  });
});
