import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';

function makeMockPrisma(overrides: Record<string, any> = {}) {
  return {
    post: { findMany: jest.fn().mockResolvedValue([]) },
    postView: { findMany: jest.fn().mockResolvedValue([]) },
    postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
    participant: { findMany: jest.fn().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn() },
    ...overrides,
  } as any;
}

describe('PostFeedService COMMUNITY visibility', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makeMockPrisma();
    // getCommunityCoMemberIds: 1) communautés du viewer, 2) co-membres
    prisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'c1' }])
      .mockResolvedValueOnce([{ userId: 'co-1' }]);
  });

  it('getStories filters COMMUNITY posts to community co-members', async () => {
    const service = new PostFeedService(prisma);
    await service.getStories('viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    const orClauses = whereArg.AND[0].OR;
    expect(orClauses).toContainEqual({ visibility: 'COMMUNITY', authorId: { in: ['co-1'] } });
  });

  it('getStatuses filters COMMUNITY posts to community co-members', async () => {
    const service = new PostFeedService(prisma);
    await service.getStatuses('viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    const orClauses = whereArg.AND[0].OR;
    expect(orClauses).toContainEqual({ visibility: 'COMMUNITY', authorId: { in: ['co-1'] } });
  });
});

// ---------------------------------------------------------------------------
// getFeed — FRIENDS-visibility posts must be gated to the viewer's contacts.
//
// Regression: the main ranked feed used a flat `visibility: { in: ['PUBLIC',
// 'FRIENDS'] }` with NO author/friend gate, so ANY user's FRIENDS-only post was
// served to EVERY viewer — a privacy leak on the most-hit social surface. Every
// sibling method (getStories/getStatuses/getReels) already gates through
// buildVisibilityFilter; getFeed was the one that skipped it.
// ---------------------------------------------------------------------------
describe('PostFeedService.getFeed visibility gating', () => {
  function feedPrisma() {
    return makeMockPrisma({
      // Viewer 'viewer-1' is friends with 'friend-1' (accepted request).
      friendRequest: {
        findMany: jest.fn().mockResolvedValue([{ senderId: 'viewer-1', receiverId: 'friend-1' }]),
      },
      // No direct-conversation contacts (two-step lookup returns empty first).
      participant: { findMany: jest.fn().mockResolvedValue([]) },
      // Community co-member 'co-1'.
      communityMember: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ communityId: 'c1' }])
          .mockResolvedValueOnce([{ userId: 'co-1' }]),
      },
    });
  }

  it('gates FRIENDS posts to the viewer\'s contacts instead of leaking them to everyone', async () => {
    const prisma = feedPrisma();
    const service = new PostFeedService(prisma);
    await service.getFeed('viewer-1');

    const where = prisma.post.findMany.mock.calls[0][0].where;
    // No bare visibility IN-filter that would leak every FRIENDS post.
    expect(where.visibility).toBeUndefined();
    // FRIENDS branch is gated by the author being one of the viewer's contacts.
    const orClauses = where.AND[0].OR;
    expect(orClauses).toContainEqual({ visibility: 'FRIENDS', authorId: { in: ['friend-1'] } });
  });

  it('still serves PUBLIC posts, the viewer\'s own posts, and community co-members', async () => {
    const prisma = feedPrisma();
    const service = new PostFeedService(prisma);
    await service.getFeed('viewer-1');

    const orClauses = prisma.post.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(orClauses).toContainEqual({ visibility: 'PUBLIC' });
    expect(orClauses).toContainEqual({ authorId: 'viewer-1' });
    expect(orClauses).toContainEqual({ visibility: 'COMMUNITY', authorId: { in: ['co-1'] } });
  });
});

// ---------------------------------------------------------------------------
// getUserPosts — a friend viewing a profile MUST see that author's FRIENDS
// posts; anonymous/non-contact viewers stay PUBLIC-only; the author sees all.
//
// Mirror image of the getFeed leak: getUserPosts hard-coded `visibility =
// 'PUBLIC'` for any non-author viewer, so a friend never saw the author's
// friends-only posts on their profile.
// ---------------------------------------------------------------------------
describe('PostFeedService.getUserPosts visibility gating', () => {
  it('lets an accepted friend see the author\'s FRIENDS-only posts', async () => {
    const prisma = makeMockPrisma({
      // Viewer is friends with the profile author 'author-1'.
      friendRequest: {
        findMany: jest.fn().mockResolvedValue([{ senderId: 'viewer-1', receiverId: 'author-1' }]),
      },
      participant: { findMany: jest.fn().mockResolvedValue([]) },
      communityMember: {
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
      },
    });
    const service = new PostFeedService(prisma);
    await service.getUserPosts('author-1', 'viewer-1');

    const where = prisma.post.findMany.mock.calls[0][0].where;
    expect(where.authorId).toBe('author-1');
    // No bare PUBLIC-only visibility that would hide the friend's FRIENDS posts.
    expect(where.visibility).toBeUndefined();
    const orClauses = where.AND[0].OR;
    expect(orClauses).toContainEqual({ visibility: 'FRIENDS', authorId: { in: ['author-1'] } });
  });

  it('restricts an anonymous viewer to PUBLIC posts only', async () => {
    const prisma = makeMockPrisma();
    const service = new PostFeedService(prisma);
    await service.getUserPosts('author-1', undefined);

    const where = prisma.post.findMany.mock.calls[0][0].where;
    expect(where.visibility).toBe('PUBLIC');
  });

  it('shows the author every one of their own posts (no visibility filter)', async () => {
    const prisma = makeMockPrisma();
    const service = new PostFeedService(prisma);
    await service.getUserPosts('author-1', 'author-1');

    const where = prisma.post.findMany.mock.calls[0][0].where;
    expect(where.visibility).toBeUndefined();
    expect(where.AND).toBeUndefined();
  });
});
